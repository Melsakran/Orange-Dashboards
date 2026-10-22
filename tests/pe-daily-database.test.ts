// @vitest-environment node

import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

const ADMIN_ID = "00000000-0000-4000-8000-000000000001";
const USER_ID = "00000000-0000-4000-8000-000000000002";

const promos = (names: string[]) =>
  names.map((promo, index) => ({ promo, last_week: index, day_before: index + 1, yesterday: index + 2 }));
const sms = [{ promo: "revive", channel: "online", last_week: 1, day_before: 2, yesterday: 3 }];
const upselling = [{ day: "2026-10-21", count: 13625673 }];

async function setIdentity(db: PGlite, role: "anon" | "authenticated", id?: string) {
  await db.exec(
    `select set_config('request.jwt.claim.sub', '${id ?? ""}', true); set local role ${role};`,
  );
}

async function saveReport(
  db: PGlite,
  date: string,
  options: { promos?: unknown; sms?: unknown; upselling?: unknown } = {},
) {
  return db.query(
    "select public.save_pe_daily_report($1::date, $2, $3::jsonb, $4::jsonb, $5::jsonb)",
    [
      date,
      `${date}.csv`,
      JSON.stringify(options.promos ?? promos(["loyalty", "revive"])),
      JSON.stringify(options.sms ?? sms),
      JSON.stringify(options.upselling ?? upselling),
    ],
  );
}

async function saveSection(db: PGlite, date: string, section: string, rows: unknown[]) {
  return db.query("select public.save_pe_daily_section($1::date, $2, $3::jsonb)", [
    date,
    section,
    JSON.stringify(rows),
  ]);
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

async function column<T>(db: PGlite, sql: string, params: unknown[] = []) {
  const result = await db.query<{ value: T }>(sql, params);
  return result.rows.map((row) => row.value);
}

describe("pe daily report database", () => {
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
    await db.exec(read("supabase/migrations/0034_pe_daily_report.sql"));
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

  it("lets anonymous visitors read the default chart settings but not write", async () => {
    await setIdentity(db, "anon");
    expect(await column<string[]>(db, "select visible_charts as value from public.pe_daily_settings"))
      .toEqual([["tx_prov", "h_dynamic"]]);
    await expectError(
      db,
      () => db.exec("insert into public.pe_daily_reports (report_date, file_name) values ('2026-10-22', 'x')"),
      /permission denied/i,
    );
    await expectError(db, () => saveReport(db, "2026-10-22"), /permission denied/i);
    await expectError(
      db,
      () => db.query("select public.save_pe_daily_chart_settings(array['sms']::text[])"),
      /permission denied/i,
    );
  });

  it("rejects every write function for signed-in non-admins", async () => {
    await setIdentity(db, "authenticated", USER_ID);
    await expectError(db, () => saveReport(db, "2026-10-22"), /admin access required/i);
    await expectError(db, () => saveSection(db, "2026-10-22", "actions", []), /admin access required/i);
    await expectError(
      db,
      () => db.query("select public.delete_pe_daily_report('2026-10-22'::date)"),
      /admin access required/i,
    );
    await expectError(
      db,
      () => db.query("select public.save_pe_daily_chart_settings(array['sms']::text[])"),
      /admin access required/i,
    );
  });

  it("saves a report, copies admin rows forward, and re-uploads without touching admin rows", async () => {
    await setIdentity(db, "authenticated", ADMIN_ID);
    await saveReport(db, "2026-10-21");
    await saveSection(db, "2026-10-21", "actions", [{ action: "Restart", status: "Done" }]);
    await saveSection(db, "2026-10-21", "tx_prov", [{ promo: "go-2", last_week: 408, day_before: 0, yesterday: 0 }]);

    await saveReport(db, "2026-10-22");
    expect(await column<unknown>(
      db,
      "select fields as value from public.pe_daily_manual_rows where report_date = '2026-10-22' order by section, position",
    )).toEqual([
      { action: "Restart", status: "Done" },
      { promo: "go-2", last_week: 408, day_before: 0, yesterday: 0 },
    ]);

    await saveSection(db, "2026-10-22", "actions", [{ action: "Check Grafana", status: "" }]);
    await saveReport(db, "2026-10-22", { promos: promos(["gamification"]) });

    expect(await column<string>(
      db,
      "select promo as value from public.pe_daily_promos where report_date = '2026-10-22' order by position",
    )).toEqual(["gamification"]);
    expect(await column<unknown>(
      db,
      "select fields->>'action' as value from public.pe_daily_manual_rows where report_date = '2026-10-22' and section = 'actions'",
    )).toEqual(["Check Grafana"]);
    expect(await column<string>(
      db,
      "select fields->>'action' as value from public.pe_daily_manual_rows where report_date = '2026-10-21' and section = 'actions'",
    )).toEqual(["Restart"]);
    expect(await column<string>(
      db,
      "select uploaded_by_email || ' ' || file_name as value from public.pe_daily_reports where report_date = '2026-10-22'",
    )).toEqual(["admin@example.com 2026-10-22.csv"]);
  });

  it("stores rows in file order and keeps positions", async () => {
    await setIdentity(db, "authenticated", ADMIN_ID);
    await saveReport(db, "2026-10-22", { promos: promos(["b", "a", "c"]) });
    expect(await column<string>(
      db,
      "select promo || ':' || position as value from public.pe_daily_promos order by position",
    )).toEqual(["b:0", "a:1", "c:2"]);
  });

  it("rejects bad payloads and keeps the previous data", async () => {
    await setIdentity(db, "authenticated", ADMIN_ID);
    await saveReport(db, "2026-10-22");

    await expectError(db, () => saveReport(db, "2026-10-22", { promos: [] }), /must not be empty/i);
    await expectError(db, () => saveReport(db, "2026-10-22", { sms: {} }), /JSON arrays/i);
    await expectError(
      db,
      () => saveReport(db, "2026-10-22", { promos: promos(["dup", "dup"]) }),
      /duplicate key/i,
    );
    await expectError(
      db,
      () => saveReport(db, "2026-10-22", { sms: [{ ...sms[0], channel: "fax" }] }),
      /check constraint/i,
    );
    await expectError(
      db,
      () => saveReport(db, "2026-10-22", { upselling: [{ day: "2026-10-21", count: -1 }] }),
      /check constraint/i,
    );

    expect(await column<string>(
      db,
      "select promo as value from public.pe_daily_promos where report_date = '2026-10-22' order by position",
    )).toEqual(["loyalty", "revive"]);
  });

  it("requires an existing report and a known section to save a section", async () => {
    await setIdentity(db, "authenticated", ADMIN_ID);
    await expectError(db, () => saveSection(db, "2026-10-22", "actions", []), /report does not exist/i);
    await saveReport(db, "2026-10-22");
    await expectError(db, () => saveSection(db, "2026-10-22", "notes", []), /unknown section/i);
    await saveSection(db, "2026-10-22", "grafana", [{ issue: "CPU" }]);
    await saveSection(db, "2026-10-22", "grafana", []);
    expect(await column<number>(
      db,
      "select count(*)::int as value from public.pe_daily_manual_rows where section = 'grafana'",
    )).toEqual([0]);
  });

  it("deletes only the chosen date", async () => {
    await setIdentity(db, "authenticated", ADMIN_ID);
    await saveReport(db, "2026-10-21");
    await saveReport(db, "2026-10-22");
    await saveSection(db, "2026-10-22", "actions", [{ action: "Restart" }]);

    await db.query("select public.delete_pe_daily_report('2026-10-22'::date)");
    expect(await column<string>(db, "select report_date::text as value from public.pe_daily_reports"))
      .toEqual(["2026-10-21"]);
    expect(await column<number>(
      db,
      "select count(*)::int as value from public.pe_daily_promos where report_date = '2026-10-22'",
    )).toEqual([0]);
    expect(await column<number>(
      db,
      "select count(*)::int as value from public.pe_daily_manual_rows where report_date = '2026-10-22'",
    )).toEqual([0]);
    await expectError(
      db,
      () => db.query("select public.delete_pe_daily_report('2026-10-22'::date)"),
      /report does not exist/i,
    );
  });

  it("validates and saves chart settings", async () => {
    await setIdentity(db, "authenticated", ADMIN_ID);
    await db.query("select public.save_pe_daily_chart_settings(array['sms', 'upselling']::text[])");
    expect(await column<string[]>(db, "select visible_charts as value from public.pe_daily_settings"))
      .toEqual([["sms", "upselling"]]);
    await expectError(
      db,
      () => db.query("select public.save_pe_daily_chart_settings(array['pie']::text[])"),
      /check constraint/i,
    );
  });
});
