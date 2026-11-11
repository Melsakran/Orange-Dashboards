// @vitest-environment node

import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

const ADMIN_ID = "00000000-0000-4000-8000-000000000001";
const USER_ID = "00000000-0000-4000-8000-000000000002";

function row(interactionId: string, overrides: Record<string, string | boolean | null> = {}) {
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

async function rpc<T = unknown>(db: PGlite, fn: string, ...args: unknown[]) {
  const placeholders = args.map((_, index) => `$${index + 1}`).join(", ");
  const result = await db.query<{ value: T }>(
    `select public.${fn}(${placeholders}) as value`,
    args.map((arg) => (arg !== null && typeof arg === "object" ? JSON.stringify(arg) : arg)),
  );
  return result.rows[0]?.value as T;
}

function manualItem(overrides: Record<string, unknown> = {}) {
  return {
    kind: "issue",
    status: "open",
    assignment_time: "2026-05-20T10:00:00",
    request_title: "Dashboard is slow",
    description: "Loads in 30s",
    requestor_name: "NFawzy",
    assigned_to: "HElGhandour",
    ...overrides,
  };
}

async function areaId(db: PGlite, name: string) {
  const result = await db.query<{ id: string }>("select id from public.ops_areas where name = $1", [name]);
  return result.rows[0]?.id as string;
}

async function requestByInteraction(db: PGlite, interactionId: string) {
  const result = await db.query<Record<string, unknown>>(
    "select * from public.ops_requests where interaction_id = $1",
    [interactionId],
  );
  return result.rows[0];
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
    await db.exec(`
      alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
      alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
    `);
    await db.exec(read("supabase/migrations/0033_ops_requests.sql"));
    await db.exec(read("supabase/migrations/0037_ops_in_progress_status.sql"));
    await db.exec(read("supabase/migrations/0040_ops_merge_requests.sql"));
    await db.exec(read("supabase/migrations/0041_ops_issues.sql"));
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

  it("accepts In Progress requests and still rejects unknown statuses", async () => {
    await setIdentity(db, "authenticated", ADMIN_ID);
    await replace(db, "wk44.csv", [row("SD1", { status: "in_progress", close_date: null })]);
    const stored = await db.query<{ status: string }>("select status from public.ops_requests");
    expect(stored.rows).toEqual([{ status: "in_progress" }]);

    await expectError(
      db,
      () => replace(db, "bad.csv", [row("SD2", { status: "resolved" })]),
      /ops_requests_status_check/,
    );
  });

  it("stores the request type and merge flag, defaulting both for older payloads", async () => {
    await setIdentity(db, "authenticated", ADMIN_ID);
    await replace(db, "wk45.csv", [
      row("SD1", { request_type: "Merge Request", is_merge_request: true }),
      row("SD2"),
    ]);
    const stored = await db.query<{ interaction_id: string; request_type: string; is_merge_request: boolean }>(
      "select interaction_id, request_type, is_merge_request from public.ops_requests order by interaction_id",
    );
    expect(stored.rows).toEqual([
      { interaction_id: "SD1", request_type: "Merge Request", is_merge_request: true },
      { interaction_id: "SD2", request_type: "", is_merge_request: false },
    ]);
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
    await expectError(db, () => replace(db, "empty.csv", []), /must not be empty/i);

    expect(await interactionIds(db)).toEqual(["SD1", "SD2"]);
  });

  it("seeds the ownership directory and the default escalation days", async () => {
    const areas = await db.query<{ area_group: string; name: string; owner_name: string; reports_to: string }>(
      `select area_group, name, owner_name, reports_to from public.ops_areas
       order by case area_group when 'reporting' then 0 when 'operations' then 1 else 2 end, sort_order`,
    );
    expect(areas.rows).toEqual([
      { area_group: "reporting", name: "CVM & B2C", owner_name: "Mohamed Adel", reports_to: "Dina Sallam" },
      { area_group: "reporting", name: "Orange Cash & Sales", owner_name: "Asmaa", reports_to: "Dina Sallam" },
      { area_group: "reporting", name: "Digital", owner_name: "Farida", reports_to: "Dina Sallam" },
      { area_group: "reporting", name: "B2B", owner_name: "Eman Kandil", reports_to: "Dina Sallam" },
      { area_group: "reporting", name: "NTRA", owner_name: "Eman Abdelnasser", reports_to: "Dina Sallam" },
      { area_group: "reporting", name: "Finance", owner_name: "Amira Hanafy", reports_to: "Dina Sallam" },
      {
        area_group: "reporting",
        name: "Customer Experience & Customer Service",
        owner_name: "Sara Hossam",
        reports_to: "Dina Sallam",
      },
      { area_group: "operations", name: "Data Lake Operations", owner_name: "On-call member", reports_to: "Mohamed Habib" },
      { area_group: "demand", name: "Data Lake", owner_name: "Sherif", reports_to: "Dina Sallam" },
      { area_group: "demand", name: "Promo Engine", owner_name: "Yasmine", reports_to: "Mohamed Habib" },
      { area_group: "demand", name: "New Platforms & APIs", owner_name: "Abdallah", reports_to: "Mohamed Habib" },
    ]);

    await setIdentity(db, "anon");
    const settings = await db.query<{ escalation_days: number }>("select escalation_days from public.ops_settings");
    expect(settings.rows).toEqual([{ escalation_days: 5 }]);
  });

  it("defaults imported rows to the operations area and marks them as imports", async () => {
    await setIdentity(db, "authenticated", ADMIN_ID);
    await replace(db, "wk46.csv", [
      row("SD1"),
      row("SD2", { request_type: "Merge Request", is_merge_request: true }),
    ]);
    const operations = await areaId(db, "Data Lake Operations");
    const stored = await db.query<{ interaction_id: string; source: string; area_id: string | null; owner_name: string }>(
      "select interaction_id, source, area_id, owner_name from public.ops_requests order by interaction_id",
    );
    expect(stored.rows).toEqual([
      { interaction_id: "SD1", source: "import", area_id: operations, owner_name: "" },
      { interaction_id: "SD2", source: "import", area_id: null, owner_name: "" },
    ]);
  });

  it("keeps manual items across uploads and lets an imported row replace a manual duplicate", async () => {
    await setIdentity(db, "authenticated", ADMIN_ID);
    await replace(db, "first.csv", [row("SD1")]);
    await rpc(db, "save_ops_manual_item", manualItem({ interaction_id: "MAN-KEEP" }));
    await rpc(db, "save_ops_manual_item", manualItem({ interaction_id: "SD2", request_title: "Manual SD2" }));

    await replace(db, "second.csv", [row("SD2", { request_title: "Imported SD2" }), row("SD3")]);

    expect(await interactionIds(db)).toEqual(["MAN-KEEP", "SD2", "SD3"]);
    const sd2 = await requestByInteraction(db, "SD2");
    expect(sd2).toMatchObject({ source: "import", request_title: "Imported SD2" });
    expect(sd2?.upload_id).not.toBeNull();
    expect(await requestByInteraction(db, "MAN-KEEP")).toMatchObject({ source: "manual", upload_id: null });
  });

  it("keeps the routing of imported issues across uploads", async () => {
    await setIdentity(db, "authenticated", ADMIN_ID);
    await replace(db, "first.csv", [row("SD1"), row("SD2")]);
    const b2b = await areaId(db, "B2B");
    const sd1 = await requestByInteraction(db, "SD1");
    await rpc(db, "route_ops_request", sd1?.id, b2b, "Someone");

    await replace(db, "second.csv", [row("SD1"), row("SD2")]);

    expect(await requestByInteraction(db, "SD1")).toMatchObject({ area_id: b2b, owner_name: "Someone" });
    expect(await requestByInteraction(db, "SD2")).toMatchObject({
      area_id: await areaId(db, "Data Lake Operations"),
      owner_name: "",
    });
  });

  it("saves manual items with generated ids, lowercase keys and normalized merge fields", async () => {
    await setIdentity(db, "authenticated", ADMIN_ID);
    const b2b = await areaId(db, "B2B");
    const id = await rpc<string>(db, "save_ops_manual_item", manualItem({ area_id: b2b, owner_name: " Eman " }));
    const stored = await db.query<Record<string, unknown>>("select * from public.ops_requests where id = $1", [id]);
    expect(stored.rows[0]).toMatchObject({
      source: "manual",
      upload_id: null,
      status: "open",
      request_title: "Dashboard is slow",
      requestor_name: "NFawzy",
      requestor_key: "nfawzy",
      assigned_to: "HElGhandour",
      assigned_to_key: "helghandour",
      is_merge_request: false,
      area_id: b2b,
      owner_name: "Eman",
    });
    expect(String(stored.rows[0]?.interaction_id)).toMatch(/^MAN-[0-9A-F]{8}$/);

    const again = await rpc<string>(
      db,
      "save_ops_manual_item",
      manualItem({ id, status: "CLOSED", close_date: "2026-05-21T10:00:00", request_title: "Updated", area_id: b2b }),
    );
    expect(again).toBe(id);
    const updated = await db.query<Record<string, unknown>>("select * from public.ops_requests");
    expect(updated.rows).toHaveLength(1);
    expect(updated.rows[0]).toMatchObject({ id, status: "closed", request_title: "Updated" });

    const mergeId = await rpc<string>(
      db,
      "save_ops_manual_item",
      manualItem({ kind: "merge", area_id: b2b, owner_name: "Ignored" }),
    );
    const merge = await db.query<Record<string, unknown>>("select * from public.ops_requests where id = $1", [mergeId]);
    expect(merge.rows[0]).toMatchObject({
      is_merge_request: true,
      request_type: "Merge Request",
      area_id: null,
      owner_name: "",
    });
  });

  it("validates manual items", async () => {
    await setIdentity(db, "authenticated", ADMIN_ID);
    await rpc(db, "save_ops_manual_item", manualItem({ interaction_id: "MAN-1" }));
    await expectError(
      db,
      () => rpc(db, "save_ops_manual_item", manualItem({ interaction_id: " MAN-1 " })),
      /already exists/,
    );
    await expectError(db, () => rpc(db, "save_ops_manual_item", manualItem({ kind: "task" })), /kind/);
    await expectError(db, () => rpc(db, "save_ops_manual_item", manualItem({ status: "resolved" })), /status/);
    await expectError(db, () => rpc(db, "save_ops_manual_item", manualItem({ request_title: "   " })), /title/);

    await replace(db, "first.csv", [row("SD1")]);
    const imported = await requestByInteraction(db, "SD1");
    await expectError(
      db,
      () => rpc(db, "save_ops_manual_item", manualItem({ id: imported?.id, request_title: "Hijack" })),
      /not found/,
    );
    expect(await requestByInteraction(db, "SD1")).toMatchObject({ request_title: "Request SD1" });
  });

  it("deletes manual items only and routes only issues", async () => {
    await setIdentity(db, "authenticated", ADMIN_ID);
    await replace(db, "first.csv", [
      row("SD1"),
      row("SD2", { request_type: "Merge Request", is_merge_request: true }),
    ]);
    const manualId = await rpc<string>(db, "save_ops_manual_item", manualItem({ interaction_id: "MAN-1" }));
    const imported = await requestByInteraction(db, "SD1");
    const merge = await requestByInteraction(db, "SD2");

    await expectError(db, () => rpc(db, "delete_ops_manual_item", imported?.id), /not found/);
    const b2b = await areaId(db, "B2B");
    await expectError(db, () => rpc(db, "route_ops_request", merge?.id, b2b, "x"), /not found/);

    await rpc(db, "delete_ops_manual_item", manualId);
    expect(await interactionIds(db)).toEqual(["SD1", "SD2"]);
  });

  it("manages ownership areas", async () => {
    await setIdentity(db, "authenticated", ADMIN_ID);
    const id = await rpc<string>(db, "save_ops_area", {
      area_group: "demand",
      name: "  Billing  ",
      owner_name: "Nour",
      reports_to: "Dina Sallam",
      sort_order: 9,
    });
    expect(
      (await db.query("select area_group, name, owner_name, reports_to, sort_order from public.ops_areas where id = $1", [id]))
        .rows[0],
    ).toEqual({ area_group: "demand", name: "Billing", owner_name: "Nour", reports_to: "Dina Sallam", sort_order: 9 });

    await rpc(db, "save_ops_area", { id, area_group: "reporting", name: "Billing 2", owner_name: "Omar" });
    expect(
      (await db.query("select area_group, name, owner_name, reports_to from public.ops_areas where id = $1", [id])).rows[0],
    ).toEqual({ area_group: "reporting", name: "Billing 2", owner_name: "Omar", reports_to: "" });

    await expectError(db, () => rpc(db, "save_ops_area", { area_group: "demand", name: "  b2b " }), /already exists/);
    await expectError(db, () => rpc(db, "save_ops_area", { area_group: "other", name: "X" }), /group/);
    await expectError(db, () => rpc(db, "save_ops_area", { area_group: "demand", name: "  " }), /name/);

    await rpc(db, "save_ops_manual_item", manualItem({ interaction_id: "MAN-1", area_id: id }));
    await rpc(db, "delete_ops_area", id);
    expect(await requestByInteraction(db, "MAN-1")).toMatchObject({ area_id: null });
    expect((await db.query("select 1 from public.ops_areas where id = $1", [id])).rows).toHaveLength(0);
  });

  it("stores escalation days within 1 to 365", async () => {
    await setIdentity(db, "authenticated", ADMIN_ID);
    await rpc(db, "save_ops_settings", 7);
    expect((await db.query("select escalation_days from public.ops_settings")).rows).toEqual([{ escalation_days: 7 }]);
    await expectError(db, () => rpc(db, "save_ops_settings", 0), /between 1 and 365/);
    await expectError(db, () => rpc(db, "save_ops_settings", 366), /between 1 and 365/);
  });

  it("backfills the operations area for unrouted imported issues when 0041 is re-run", async () => {
    await db.exec("reset role");
    const b2b = await areaId(db, "B2B");
    const operations = await areaId(db, "Data Lake Operations");
    await db.query(
      `insert into public.ops_requests (interaction_id, status, assignment_time, is_merge_request, source, area_id, owner_name)
       values
         ('OLD-ISSUE', 'open', '2026-05-17T13:50:00', false, 'import', null, ''),
         ('OLD-MERGE', 'open', '2026-05-17T13:50:00', true, 'import', null, ''),
         ('OLD-ROUTED', 'open', '2026-05-17T13:50:00', false, 'import', $1, 'Someone'),
         ('OLD-MANUAL', 'open', '2026-05-17T13:50:00', false, 'manual', null, '')`,
      [b2b],
    );

    await db.exec(read("supabase/migrations/0041_ops_issues.sql"));

    const stored = await db.query<{ interaction_id: string; area_id: string | null; owner_name: string }>(
      "select interaction_id, area_id, owner_name from public.ops_requests order by interaction_id",
    );
    expect(stored.rows).toEqual([
      { interaction_id: "OLD-ISSUE", area_id: operations, owner_name: "" },
      { interaction_id: "OLD-MANUAL", area_id: null, owner_name: "" },
      { interaction_id: "OLD-MERGE", area_id: null, owner_name: "" },
      { interaction_id: "OLD-ROUTED", area_id: b2b, owner_name: "Someone" },
    ]);
  });

  it("carries routing only for rows that were issues in the previous upload", async () => {
    await setIdentity(db, "authenticated", ADMIN_ID);
    await replace(db, "first.csv", [
      row("SD1", { request_type: "Merge Request", is_merge_request: true }),
      row("SD2"),
    ]);
    const b2b = await areaId(db, "B2B");
    const sd2 = await requestByInteraction(db, "SD2");
    await rpc(db, "route_ops_request", sd2?.id, b2b, "Someone");

    await replace(db, "second.csv", [row("SD1"), row("SD2", { request_type: "Merge Request", is_merge_request: true })]);

    expect(await requestByInteraction(db, "SD1")).toMatchObject({
      is_merge_request: false,
      area_id: await areaId(db, "Data Lake Operations"),
      owner_name: "",
    });
    expect(await requestByInteraction(db, "SD2")).toMatchObject({ is_merge_request: true, area_id: null, owner_name: "" });
  });

  it("clears the merge request type when a manual merge request becomes an issue", async () => {
    await setIdentity(db, "authenticated", ADMIN_ID);
    const id = await rpc<string>(db, "save_ops_manual_item", manualItem({ kind: "merge" }));
    expect(await db.query("select request_type from public.ops_requests where id = $1", [id])).toMatchObject({
      rows: [{ request_type: "Merge Request" }],
    });

    await rpc(db, "save_ops_manual_item", manualItem({ id, kind: "issue" }));
    expect(await db.query("select request_type, is_merge_request from public.ops_requests where id = $1", [id])).toMatchObject({
      rows: [{ request_type: "", is_merge_request: false }],
    });
  });

  it("restricts every new function to admins", async () => {
    const calls: Array<[string, () => Promise<unknown>]> = [
      ["save_ops_manual_item", () => rpc(db, "save_ops_manual_item", manualItem())],
      ["delete_ops_manual_item", () => rpc(db, "delete_ops_manual_item", ADMIN_ID)],
      ["route_ops_request", () => rpc(db, "route_ops_request", ADMIN_ID, null, "x")],
      ["save_ops_area", () => rpc(db, "save_ops_area", { area_group: "demand", name: "X" })],
      ["delete_ops_area", () => rpc(db, "delete_ops_area", ADMIN_ID)],
      ["save_ops_settings", () => rpc(db, "save_ops_settings", 7)],
    ];
    for (const [, run] of calls) {
      await setIdentity(db, "authenticated", USER_ID);
      await expectError(db, run, /admin access required/i);
      await db.exec("reset role");
      await setIdentity(db, "anon");
      await expectError(db, run, /permission denied/i);
      await db.exec("reset role");
    }
  });
});
