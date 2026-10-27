// @vitest-environment node

import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");
const migrationPath = "supabase/migrations/0036_pe_delivery_project_tiers.sql";

const PE = "10000000-0000-4000-8000-000000000008";
const UPCOMING = "20000000-0000-4000-8000-00000000003d";
const ITEM = "70000000-0000-4000-8000-000000000011";
const EXPECTED_ORDER = [
  "Planning",
  "Development",
  "Upcoming Delivery",
  "Testing",
  "Live",
  "Delayed",
  "On Hold",
];

describe("PE Development project tiers migration", () => {
  let db: PGlite;

  async function statuses() {
    const result = await db.query<{ id: string; name: string; sort_order: number }>(
      `select id, name, sort_order from public.statuses
        where workspace_id = $1 order by sort_order`,
      [PE],
    );
    return result.rows;
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
    await db.exec(`
      insert into public.workspaces (id, slug, name, sort_order)
      values ('${PE}', 'pe-delivery', 'PE Development', 1);

      insert into public.statuses (id, workspace_id, name, color, sort_order, reporting_category)
      values
        ('20000000-0000-4000-8000-00000000001d', '${PE}', 'Planning', '#23b123', 0, 'active'),
        ('20000000-0000-4000-8000-00000000001e', '${PE}', 'Development', '#23b123', 1, 'active'),
        ('20000000-0000-4000-8000-000000000029', '${PE}', 'On Hold', '#f59e0b', 2, 'risk'),
        ('20000000-0000-4000-8000-00000000001f', '${PE}', 'Testing', '#246a91', 3, 'active'),
        ('20000000-0000-4000-8000-00000000002a', '${PE}', 'Live', '#16a34a', 4, 'completed'),
        ('20000000-0000-4000-8000-000000000020', '${PE}', 'Delayed', '#ef4444', 5, 'delayed');

      insert into public.work_items (id, workspace_id, title, status_id)
      values ('${ITEM}', '${PE}', 'Existing project', '20000000-0000-4000-8000-00000000001d');
    `);
    await db.exec(read(migrationPath));
  });

  afterAll(async () => {
    await db.close();
  });

  it("adds Upcoming Delivery after Development and moves On Hold after Delayed", async () => {
    const rows = await statuses();
    expect(rows.map((row) => row.name)).toEqual(EXPECTED_ORDER);
    expect(rows.map((row) => row.sort_order)).toEqual([0, 1, 2, 3, 4, 5, 6]);

    const upcoming = await db.query<{ id: string; color: string; reporting_category: string }>(
      `select id, color, reporting_category from public.statuses where name = 'Upcoming Delivery'`,
    );
    expect(upcoming.rows).toEqual([{ id: UPCOMING, color: "#23b123", reporting_category: "active" }]);
  });

  it("tags existing projects as standard", async () => {
    const result = await db.query<{ project_tier: string }>(
      `select project_tier from public.work_items where id = $1`,
      [ITEM],
    );
    expect(result.rows[0].project_tier).toBe("standard");
  });

  it("accepts critical and rejects any other tag", async () => {
    await db.exec(`update public.work_items set project_tier = 'critical' where id = '${ITEM}'`);
    await expect(
      db.exec(`update public.work_items set project_tier = 'urgent' where id = '${ITEM}'`),
    ).rejects.toThrow(/violates check constraint/);
  });

  it("can be re-run without duplicating or reordering wrongly", async () => {
    await db.exec(read(migrationPath));
    expect((await statuses()).map((row) => row.name)).toEqual(EXPECTED_ORDER);
  });

  it("keeps an Upcoming Delivery status an admin already created", async () => {
    await db.exec(`
      delete from public.statuses where id = '${UPCOMING}';
      insert into public.statuses (id, workspace_id, name, color, sort_order, reporting_category)
      values ('20000000-0000-4000-8000-0000000000ff', '${PE}', 'Upcoming delivery', '#123456', 50, 'active');
    `);
    await db.exec(read(migrationPath));

    const rows = await statuses();
    expect(rows.map((row) => row.name.toLowerCase())).toEqual(
      EXPECTED_ORDER.map((name) => name.toLowerCase()),
    );
    expect(rows.filter((row) => row.name.toLowerCase() === "upcoming delivery").map((row) => row.id))
      .toEqual(["20000000-0000-4000-8000-0000000000ff"]);
  });
});
