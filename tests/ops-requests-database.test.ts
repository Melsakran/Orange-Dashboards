// @vitest-environment node

import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

const ADMIN_ID = "00000000-0000-4000-8000-000000000001";
const USER_ID = "00000000-0000-4000-8000-000000000002";

function row(interactionId: string, overrides: Record<string, string | null> = {}) {
  return {
    interaction_id: interactionId,
    status: "closed",
    assignment_time: "2026-05-17T13:50:00",
    title: "New Task",
    request_title: `Request ${interactionId}`,
    description: "",
    requestor_name: "NFawzy",
    requestor_key: "nfawzy",
    close_date: "2026-05-18T09:05:00",
    closure_code: "Successful",
    closure_comments: "Done",
    assigned_to: "helghandour",
    assigned_to_key: "helghandour",
    ...overrides,
  };
}

async function setIdentity(db: PGlite, role: "anon" | "authenticated", id?: string) {
  await db.exec(
    `select set_config('request.jwt.claim.sub', '${id ?? ""}', true); set local role ${role};`,
  );
}

async function replace(db: PGlite, fileName: string, rows: unknown[]) {
  return db.query<{ id: string }>(
    "select public.replace_ops_requests($1, $2::jsonb) as id",
    [fileName, JSON.stringify(rows)],
  );
}

async function expectError(db: PGlite, run: () => Promise<unknown>, message: RegExp) {
  await db.exec("savepoint expected_error");
  let error: unknown;
  try {
    await run();
  } catch (caught) {
    error = caught;
  }
  await db.exec("rollback to savepoint expected_error");
  await db.exec("release savepoint expected_error");
  expect(String(error)).toMatch(message);
}

async function interactionIds(db: PGlite) {
  const result = await db.query<{ interaction_id: string }>(
    "select interaction_id from public.ops_requests order by interaction_id",
  );
  return result.rows.map((entry) => entry.interaction_id);
}

describe("ops requests database", () => {
  let db: PGlite;

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
    await db.exec(read("supabase/migrations/0033_ops_requests.sql"));
    await db.exec(`
      insert into auth.users (id) values ('${ADMIN_ID}'), ('${USER_ID}');
      insert into public.admin_users (auth_user_id, email, display_name)
      values ('${ADMIN_ID}', 'admin@example.com', 'Admin');
    `);
  });

  beforeEach(async () => {
    await db.exec("begin");
  });

  afterEach(async () => {
    await db.exec("rollback");
  });

  afterAll(async () => {
    await db.close();
  });

  it("lets anonymous visitors read but not write", async () => {
    await setIdentity(db, "anon");
    const count = await db.query<{ count: number }>(
      "select count(*)::int as count from public.ops_requests",
    );
    expect(count.rows[0]?.count).toBe(0);
    await expectError(
      db,
      () => db.exec(`insert into public.ops_requests (interaction_id, status, assignment_time, upload_id)
        values ('SD1', 'open', now(), gen_random_uuid())`),
      /permission denied/i,
    );
    await expectError(db, () => replace(db, "a.csv", [row("SD1")]), /permission denied/i);
  });

  it("rejects replace calls from signed-in non-admins", async () => {
    await setIdentity(db, "authenticated", USER_ID);
    await expectError(db, () => replace(db, "a.csv", [row("SD1")]), /admin access required/i);
  });

  it("replaces every row and records the upload for admins", async () => {
    await setIdentity(db, "authenticated", ADMIN_ID);
    await replace(db, "first.csv", [row("SD1"), row("SD2", { status: "open", close_date: null })]);
    expect(await interactionIds(db)).toEqual(["SD1", "SD2"]);

    const second = await replace(db, "second.xlsx", [row("SD3", { status: "PENDING", close_date: null })]);
    expect(await interactionIds(db)).toEqual(["SD3"]);

    const stored = await db.query<{ status: string; upload_id: string }>(
      "select status, upload_id from public.ops_requests",
    );
    expect(stored.rows[0]).toEqual({ status: "pending", upload_id: second.rows[0]?.id });

    const upload = await db.query<{ file_name: string; row_count: number; uploaded_by_email: string }>(
      "select file_name, row_count, uploaded_by_email from public.ops_request_uploads where id = $1",
      [second.rows[0]?.id],
    );
    expect(upload.rows[0]).toEqual({
      file_name: "second.xlsx",
      row_count: 1,
      uploaded_by_email: "admin@example.com",
    });
  });

  it("keeps the previous rows when a replace fails", async () => {
    await setIdentity(db, "authenticated", ADMIN_ID);
    await replace(db, "first.csv", [row("SD1"), row("SD2")]);

    await expectError(db, () => replace(db, "dupes.csv", [row("SD9"), row("SD9")]), /duplicate key/i);
    await expectError(db, () => replace(db, "bad.csv", [row("SD8", { status: "resolved" })]), /check constraint/i);
    await expectError(
      db,
      () => replace(db, "early.csv", [row("SD7", { close_date: "2026-05-01T00:00:00" })]),
      /check constraint/i,
    );
    await expectError(db, () => db.query("select public.replace_ops_requests('x.csv', '{}'::jsonb)"), /array/i);

    expect(await interactionIds(db)).toEqual(["SD1", "SD2"]);
  });
});
