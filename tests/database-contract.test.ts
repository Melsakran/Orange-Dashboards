// @vitest-environment node

import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");
const migration = read("supabase/migrations/0001_core_schema.sql");
const seed = read("supabase/seed.sql");

const HOT_TOPICS_ID = "10000000-0000-4000-8000-000000000001";
const PLATFORM_ID = "10000000-0000-4000-8000-000000000002";
const HOT_ACTIVE_ID = "20000000-0000-4000-8000-000000000001";
const PLATFORM_ACTIVE_ID = "20000000-0000-4000-8000-000000000005";
const HOT_PROJECT_ID = "30000000-0000-4000-8000-000000000001";

type CountRow = { count: number };

async function expectSqlError(db: PGlite, sql: string, message?: RegExp) {
  await db.exec("savepoint expected_error");
  let error: unknown;
  try {
    await db.exec(sql);
  } catch (caught) {
    error = caught;
  }
  await db.exec("rollback to savepoint expected_error");
  await db.exec("release savepoint expected_error");

  expect(error).toBeDefined();
  if (message) {
    expect(String(error)).toMatch(message);
  }
}

describe("Supabase core database behavior", () => {
  let db: PGlite;

  beforeAll(async () => {
    db = new PGlite();
    await db.exec(`
      create schema auth;
      create table auth.users (id uuid primary key);
      create role anon nologin;
      create role authenticated nologin;
      create role service_role nologin bypassrls;
      create or replace function public.is_admin()
      returns boolean
      language sql
      stable
      set search_path = ''
      as $$ select false $$;
    `);
    await db.exec(migration);
    await db.exec(read("supabase/migrations/0027_digital_dashboard.sql"));
    await db.exec(read("supabase/migrations/0028_data_lake_dashboard.sql"));
    await db.exec(read("supabase/migrations/0029_data_lake_on_hold_done.sql"));
    await db.exec(read("supabase/migrations/0030_data_lake_planning_testing.sql"));
    await db.exec(read("supabase/migrations/0031_data_lake_ai_reports_insights.sql"));
    await db.exec(read("supabase/migrations/0032_pe_delivery_development_status.sql"));
    await db.exec(seed);
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

  it("seeds manual dashboards and hides Jira mirrors from product order", async () => {
    const rows = await db.query<{ slug: string; sort_order: number }>(`
      select slug, sort_order
        from public.workspaces
       order by sort_order
    `);
    expect(rows.rows.map((row) => row.slug)).toEqual([
      "hot-topics",
      "pe-delivery",
      "platforms-development",
      "development-operations",
      "pe-ops",
      "datalake-ops",
      "digital",
      "data-lake",
      "reports-and-insights",
      "platform-development",
      "pe-development",
      "pe-operations",
      "datalake-operations",
    ]);

    const names = await db.query<{ slug: string; name: string }>(`
      select slug, name
        from public.workspaces
       where slug in (
         'development-operations',
         'platforms-development',
         'platform-development',
         'pe-delivery',
         'pe-development',
         'pe-ops',
         'pe-operations',
         'datalake-ops',
         'datalake-operations',
         'digital',
         'data-lake',
         'reports-and-insights'
       )
       order by slug
    `);
    expect(names.rows).toEqual([
      { slug: "data-lake", name: "Data Lake and AI" },
      { slug: "datalake-operations", name: "Data Lake Operations Jira" },
      { slug: "datalake-ops", name: "Data Lake Operations" },
      { slug: "development-operations", name: "Dev Ops" },
      { slug: "digital", name: "Digital" },
      { slug: "pe-delivery", name: "PE Development" },
      { slug: "pe-development", name: "PE Development Jira" },
      { slug: "pe-operations", name: "PE Operations Jira" },
      { slug: "pe-ops", name: "PE Operations" },
      { slug: "platform-development", name: "Platform Development" },
      { slug: "platforms-development", name: "Platforms Development" },
      { slug: "reports-and-insights", name: "Reports and Insights" },
    ]);

    const manualStatuses = await db.query<{ slug: string; name: string }>(`
      select w.slug, s.name
        from public.statuses s
        join public.workspaces w on w.id = s.workspace_id
       where w.slug in (
         'platforms-development',
         'pe-delivery',
         'pe-ops',
         'datalake-ops',
         'digital',
         'data-lake',
         'reports-and-insights'
       )
       order by w.slug, s.sort_order
    `);
    expect(manualStatuses.rows).toEqual([
      { slug: "data-lake", name: "Planning" },
      { slug: "data-lake", name: "In Progress" },
      { slug: "data-lake", name: "Pending" },
      { slug: "data-lake", name: "On Hold" },
      { slug: "data-lake", name: "Testing" },
      { slug: "data-lake", name: "Done" },
      { slug: "datalake-ops", name: "Data Ingestion" },
      { slug: "datalake-ops", name: "DAG Monitoring" },
      { slug: "datalake-ops", name: "Segmentation Files" },
      { slug: "datalake-ops", name: "Reporting Delivery" },
      { slug: "datalake-ops", name: "Feeds" },
      { slug: "datalake-ops", name: "Deployments" },
      { slug: "digital", name: "In Progress" },
      { slug: "digital", name: "Pending" },
      { slug: "digital", name: "Cancelled" },
      { slug: "digital", name: "Live" },
      { slug: "pe-delivery", name: "Planning" },
      { slug: "pe-delivery", name: "Development" },
      { slug: "pe-delivery", name: "Upcoming Delivery" },
      { slug: "pe-delivery", name: "Testing" },
      { slug: "pe-delivery", name: "Live" },
      { slug: "pe-delivery", name: "Delayed" },
      { slug: "pe-delivery", name: "On Hold" },
      { slug: "pe-ops", name: "Promos" },
      { slug: "pe-ops", name: "PE Platform" },
      { slug: "pe-ops", name: "Plot" },
      { slug: "pe-ops", name: "Connect" },
      { slug: "platforms-development", name: "Planning" },
      { slug: "platforms-development", name: "In Progress" },
      { slug: "platforms-development", name: "Done" },
      { slug: "platforms-development", name: "Delayed" },
      { slug: "reports-and-insights", name: "Planning" },
      { slug: "reports-and-insights", name: "In Progress" },
      { slug: "reports-and-insights", name: "Pending" },
      { slug: "reports-and-insights", name: "On Hold" },
      { slug: "reports-and-insights", name: "Testing" },
      { slug: "reports-and-insights", name: "Done" },
    ]);

    const releaseColumn = await db.query<{ column_name: string }>(`
      select column_name
        from information_schema.columns
       where table_schema = 'public'
         and table_name = 'work_items'
         and column_name = 'release_tag'
    `);
    expect(releaseColumn.rows).toEqual([{ column_name: "release_tag" }]);

    const teamTracksTable = await db.query<{ table_name: string }>(`
      select table_name
        from information_schema.tables
       where table_schema = 'public'
         and table_name = 'work_item_team_tracks'
    `);
    expect(teamTracksTable.rows).toEqual([{ table_name: "work_item_team_tracks" }]);
  });

  it("applies the migration and seed with UUID keys, timestamps, foreign keys, and indexes", async () => {
    const columns = await db.query<{
      table_name: string;
      id_type: string;
      created_type: string;
    }>(`
      select c.table_name,
             max(c.data_type) filter (where c.column_name = 'id') as id_type,
             max(c.data_type) filter (where c.column_name = 'created_at') as created_type
        from information_schema.columns c
       where c.table_schema = 'public'
         and c.table_name in (
           'admin_users', 'workspaces', 'statuses', 'work_items',
           'comments', 'activity_history'
         )
       group by c.table_name
    `);

    expect(columns.rows).toHaveLength(6);
    expect(columns.rows.every((row) => row.id_type === "uuid")).toBe(true);
    expect(columns.rows.every((row) => row.created_type === "timestamp with time zone")).toBe(true);

    const foreignKeys = await db.query<{
      source_table: string;
      target_schema: string;
      target_table: string;
    }>(`
      select source.relname as source_table,
             target_namespace.nspname as target_schema,
             target.relname as target_table
        from pg_constraint constraint_record
        join pg_class source on source.oid = constraint_record.conrelid
        join pg_class target on target.oid = constraint_record.confrelid
        join pg_namespace target_namespace on target_namespace.oid = target.relnamespace
       where constraint_record.contype = 'f'
         and constraint_record.connamespace = 'public'::regnamespace
    `);
    expect(foreignKeys.rows).toEqual(
      expect.arrayContaining([
        { source_table: "admin_users", target_schema: "auth", target_table: "users" },
        { source_table: "statuses", target_schema: "public", target_table: "workspaces" },
        { source_table: "work_items", target_schema: "public", target_table: "statuses" },
        { source_table: "comments", target_schema: "public", target_table: "work_items" },
      ]),
    );

    const indexes = await db.query<{ indexname: string }>(`
      select indexname
        from pg_indexes
       where schemaname = 'public'
    `);
    expect(indexes.rows.map(({ indexname }) => indexname)).toEqual(
      expect.arrayContaining([
        "statuses_workspace_name_ci_key",
        "work_items_workspace_parent_sort_idx",
        "work_items_workspace_status_idx",
        "comments_work_item_created_idx",
        "activity_history_entity_idx",
      ]),
    );
  });

  it("links admin users to auth users and cascades deleted auth identities", async () => {
    const authUserId = "50000000-0000-4000-8000-000000000001";
    await db.exec(`insert into auth.users (id) values ('${authUserId}')`);
    await db.exec(`
      insert into public.admin_users (auth_user_id, email, display_name)
      values ('${authUserId}', 'admin@example.com', 'Admin')
    `);

    await expectSqlError(
      db,
      `
        insert into public.admin_users (auth_user_id, email, display_name)
        values ('50000000-0000-4000-8000-000000000099', 'missing@example.com', 'Missing')
      `,
    );

    await db.exec(`delete from auth.users where id = '${authUserId}'`);
    const remaining = await db.query<CountRow>(
      "select count(*)::int as count from public.admin_users where email = 'admin@example.com'",
    );
    expect(remaining.rows[0].count).toBe(0);
  });

  it("enforces case-insensitive status names without a redundant name constraint", async () => {
    await expectSqlError(
      db,
      `
        insert into public.statuses
          (workspace_id, name, color, sort_order, reporting_category)
        values
          ('${HOT_TOPICS_ID}', 'in progress', '#000000', 99, 'active')
      `,
    );

    const nameConstraints = await db.query<CountRow>(`
      select count(*)::int as count
        from pg_constraint
       where conrelid = 'public.statuses'::regclass
         and contype = 'u'
         and pg_get_constraintdef(oid) ilike '%workspace_id, name%'
    `);
    expect(nameConstraints.rows[0].count).toBe(0);
  });

  it("restricts deletion of a status used by work items", async () => {
    await expectSqlError(
      db,
      `delete from public.statuses where id = '${HOT_ACTIVE_ID}'`,
    );
  });

  it("stores comments with author, body, and timestamptz timestamps", async () => {
    const columns = await db.query<{ column_name: string; data_type: string }>(`
      select column_name, data_type
        from information_schema.columns
       where table_schema = 'public'
         and table_name = 'comments'
       order by ordinal_position
    `);
    const shape = Object.fromEntries(
      columns.rows.map(({ column_name, data_type }) => [column_name, data_type]),
    );

    expect(shape.author_name).toBe("text");
    expect(shape.body).toBe("text");
    expect(shape.created_at).toBe("timestamp with time zone");
    expect(shape.updated_at).toBe("timestamp with time zone");

    const inserted = await db.query<{
      id: string;
      author_name: string;
      body: string;
      has_timestamps: boolean;
    }>(`
      insert into public.comments (work_item_id, author_name, body)
      values ('${HOT_PROJECT_ID}', 'Reviewer', 'Behavioral test')
      returning id, author_name, body,
                (created_at is not null and updated_at is not null) as has_timestamps
    `);
    expect(inserted.rows[0]).toMatchObject({
      author_name: "Reviewer",
      body: "Behavioral test",
      has_timestamps: true,
    });
    expect(inserted.rows[0].id).toMatch(/^[0-9a-f-]{36}$/i);
  });

  it("seeds only 13 Hot Topics projects and their two comments", async () => {
    await db.exec(seed);
    const counts = await db.query<{
      hot_projects: number;
      total_items: number;
      other_items: number;
      comments: number;
    }>(`
      select
        count(*) filter (
          where wi.workspace_id = '${HOT_TOPICS_ID}' and wi.parent_id is null
        )::int as hot_projects,
        count(*)::int as total_items,
        count(*) filter (where wi.workspace_id <> '${HOT_TOPICS_ID}')::int as other_items,
        (select count(*)::int from public.comments) as comments
      from public.work_items wi
    `);

    expect(counts.rows[0]).toEqual({
      hot_projects: 13,
      total_items: 13,
      other_items: 0,
      comments: 2,
    });
  });

  it("rejects nested and cross-workspace subtasks", async () => {
    const subtaskId = "60000000-0000-4000-8000-000000000001";
    await db.exec(`
      insert into public.work_items
        (id, workspace_id, parent_id, title, status_id, sort_order)
      values
        ('${subtaskId}', '${HOT_TOPICS_ID}', '${HOT_PROJECT_ID}', 'Subtask', '${HOT_ACTIVE_ID}', 0)
    `);

    await expectSqlError(
      db,
      `
        insert into public.work_items
          (workspace_id, parent_id, title, status_id, sort_order)
        values
          ('${HOT_TOPICS_ID}', '${subtaskId}', 'Nested', '${HOT_ACTIVE_ID}', 0)
      `,
      /parent work item must be a project/i,
    );

    await expectSqlError(
      db,
      `
        insert into public.work_items
          (workspace_id, parent_id, title, status_id, sort_order)
        values
          ('${PLATFORM_ID}', '${HOT_PROJECT_ID}', 'Cross workspace', '${PLATFORM_ACTIVE_ID}', 0)
      `,
      /same workspace/i,
    );
  });

  it("rejects statuses from a different workspace", async () => {
    await expectSqlError(
      db,
      `
        insert into public.work_items
          (workspace_id, title, status_id, sort_order)
        values
          ('${PLATFORM_ID}', 'Wrong status', '${HOT_ACTIVE_ID}', 0)
      `,
    );
  });

  it.each(["project", "subtask"])(
    "atomically rejects stale update and delete filters for a %s",
    async (kind) => {
      const id = kind === "project"
        ? HOT_PROJECT_ID
        : "60000000-0000-4000-8000-000000000010";
      if (kind === "subtask") {
        await db.exec(`
          insert into public.work_items
            (id, workspace_id, parent_id, title, status_id, sort_order)
          values
            ('${id}', '${HOT_TOPICS_ID}', '${HOT_PROJECT_ID}', 'Concurrent subtask',
             '${HOT_ACTIVE_ID}', 0)
        `);
      }
      const loaded = await db.query<{ updated_at: string }>(`
        select updated_at from public.work_items where id = '${id}'
      `);
      const expected = new Date(loaded.rows[0].updated_at).toISOString();
      await db.exec(`
        update public.work_items
           set title = 'Admin one'
         where id = '${id}'
           and workspace_id = '${HOT_TOPICS_ID}'
           and updated_at = '${expected}'
      `);
      const staleUpdate = await db.query<{ id: string }>(`
        update public.work_items
           set title = 'Admin two stale'
         where id = '${id}'
           and workspace_id = '${HOT_TOPICS_ID}'
           and updated_at = '${expected}'
        returning id
      `);
      const staleDelete = await db.query<{ id: string }>(`
        delete from public.work_items
         where id = '${id}'
           and workspace_id = '${HOT_TOPICS_ID}'
           and updated_at = '${expected}'
        returning id
      `);
      expect(staleUpdate.rows).toEqual([]);
      expect(staleDelete.rows).toEqual([]);
      const authoritative = await db.query<{ title: string }>(`
        select title from public.work_items where id = '${id}'
      `);
      expect(authoritative.rows).toEqual([{ title: "Admin one" }]);
    },
  );

  it("keeps activity history append-only and source-independent", async () => {
    const metadata = await db.query<{
      updated_columns: number;
      foreign_keys: number;
    }>(`
      select
        count(*) filter (where c.column_name = 'updated_at')::int as updated_columns,
        (
          select count(*)::int
            from pg_constraint
           where conrelid = 'public.activity_history'::regclass
             and contype = 'f'
        ) as foreign_keys
      from information_schema.columns c
      where c.table_schema = 'public'
        and c.table_name = 'activity_history'
    `);

    expect(metadata.rows[0]).toEqual({ updated_columns: 0, foreign_keys: 0 });
  });

  it("does not add Task 3 RLS, audit, realtime, or RPC behavior", async () => {
    const taskThreeObjects = await db.query<{
      policies: number;
      rls_tables: number;
      audit_triggers: number;
      realtime_tables: number;
      rpc_functions: number;
    }>(`
      select
        (select count(*)::int from pg_policies where schemaname = 'public') as policies,
        (
          select count(*)::int
            from pg_class
           where relnamespace = 'public'::regnamespace
             and relrowsecurity
        ) as rls_tables,
        (
          select count(*)::int
            from pg_trigger
           where tgrelid in (
             select oid from pg_class where relnamespace = 'public'::regnamespace
           )
             and not tgisinternal
             and tgname not like 'set_%_updated_at'
             and tgname <> 'validate_work_item_hierarchy'
             and tgname <> 'validate_work_item_team_track_workspace'
        ) as audit_triggers,
        (
          select count(*)::int
            from pg_publication_tables
           where schemaname = 'public'
        ) as realtime_tables,
        (
          select count(*)::int
            from pg_proc
           where pronamespace = 'public'::regnamespace
             and prorettype <> 'trigger'::regtype
             and proname not in (
               'is_admin',
               'replace_and_delete_status',
               'check_work_item_team_track_workspace'
             )
        ) as rpc_functions
    `);

    // Later migrations (e.g. Data Lake team tracks) may add RLS for new tables.
    // This assertion still guards against Task-3-era objects on the core tables.
    expect(taskThreeObjects.rows[0]).toEqual({
      policies: 4,
      rls_tables: 1,
      audit_triggers: 0,
      realtime_tables: 0,
      rpc_functions: 0,
    });
  });
});
