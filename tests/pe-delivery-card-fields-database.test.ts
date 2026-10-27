// @vitest-environment node

import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");
const migrationPath = "supabase/migrations/0035_pe_delivery_card_fields.sql";

const PE_WORKSPACE = "10000000-0000-4000-8000-000000000008";
const PE_STATUS = "20000000-0000-4000-8000-00000000001d";
const PE_ITEM = "70000000-0000-4000-8000-000000000001";
const OTHER_ITEM = "70000000-0000-4000-8000-000000000002";

type ItemRow = {
  end_date: string | null;
  readiness_date: string | null;
  team_effort_wd: string | null;
  time_to_market_wd: string | null;
};

describe("PE Development card fields migration", () => {
  let db: PGlite;

  async function item(id: string) {
    const result = await db.query<ItemRow>(
      `select end_date::text,
              readiness_date::text,
              team_effort_wd::text,
              time_to_market_wd::text
         from public.work_items
        where id = $1`,
      [id],
    );
    return result.rows[0];
  }

  beforeAll(async () => {
    db = new PGlite();
    await db.exec(`
      create schema auth;
      create table auth.users (id uuid primary key);
      create function auth.uid() returns uuid language sql stable set search_path = ''
      as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      create role anon nologin;
      create role authenticated nologin;
      create role service_role nologin bypassrls;
      grant usage on schema public, auth to anon, authenticated, service_role;
      grant execute on function auth.uid() to anon, authenticated, service_role;
      create publication supabase_realtime;
    `);
    await db.exec(read("supabase/migrations/0001_core_schema.sql"));
    await db.exec(read("supabase/migrations/0002_security_audit_realtime.sql"));
    await db.exec(read("supabase/seed.sql"));
    await db.exec(`
      insert into public.work_items
        (id, workspace_id, title, status_id, start_date, end_date, sort_order)
      values
        ('${PE_ITEM}', '${PE_WORKSPACE}', 'PE project', '${PE_STATUS}',
         '2026-01-01', '2026-02-01', 900);

      insert into public.work_items
        (id, workspace_id, title, status_id, start_date, end_date, sort_order)
      select '${OTHER_ITEM}', workspace.id, 'Other project', status.id,
             '2026-01-01', '2026-02-01', 900
        from public.workspaces as workspace
        join public.statuses as status on status.workspace_id = workspace.id
       where workspace.slug <> 'pe-delivery'
       order by workspace.sort_order, status.sort_order
       limit 1;
    `);
    await db.exec(read(migrationPath));
    await db.exec(read("supabase/migrations/0038_pe_readiness_before_deployment.sql"));
  });

  afterAll(async () => {
    await db.close();
  });

  it("clears old Target dates only on PE Development", async () => {
    expect((await item(PE_ITEM)).end_date).toBeNull();
    expect((await item(OTHER_ITEM)).end_date).toBe("2026-02-01");
  });

  it("does not clear Deployment Dates when the migration runs again", async () => {
    await db.exec(`update public.work_items set end_date = '2026-03-01' where id = '${PE_ITEM}'`);
    await db.exec(read(migrationPath));
    expect((await item(PE_ITEM)).end_date).toBe("2026-03-01");
  });

  it("stores the readiness date and one-decimal efforts", async () => {
    await db.exec(`
      update public.work_items
         set end_date = '2026-03-01',
             readiness_date = '2026-03-10',
             team_effort_wd = 2.5,
             time_to_market_wd = 12
       where id = '${PE_ITEM}'
    `);
    expect(await item(PE_ITEM)).toEqual({
      end_date: "2026-03-01",
      readiness_date: "2026-03-10",
      team_effort_wd: "2.5",
      time_to_market_wd: "12.0",
    });
  });

  it("allows a readiness date before the deployment date", async () => {
    await db.exec(`update public.work_items set readiness_date = '2026-02-28' where id = '${PE_ITEM}'`);
    expect((await item(PE_ITEM)).readiness_date).toBe("2026-02-28");
  });

  it.each([
    [
      "a readiness date before the start date when deployment is set",
      "end_date = '2026-03-01', readiness_date = '2025-12-31'",
    ],
    [
      "a readiness date before the start date when deployment is empty",
      "end_date = null, readiness_date = '2025-12-31'",
    ],
    ["a negative team effort", "team_effort_wd = -1"],
    ["a negative time to market effort", "time_to_market_wd = -0.5"],
  ])("rejects %s", async (_label, assignment) => {
    await expect(
      db.exec(`update public.work_items set ${assignment} where id = '${PE_ITEM}'`),
    ).rejects.toThrow(/violates check constraint/);
  });
});
