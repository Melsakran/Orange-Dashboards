# PE Development Critical / Standard KPI rows: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task.
> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On PE Development (`pe-delivery`):
- Add an "Upcoming Delivery" status after Development.
- Move On Hold after Delayed.
- Split the KPI cards into two titled rows, "Critical Projects" and
  "Standard Projects". Each row counts projects by a per-project tag that admins
  set, defaulting to Standard.

**Architecture:**
- **Tag.** A new `work_items.project_tier` column holds the tag.
- **Statuses.** KPI cards are generated from statuses, so the new card is a new
  status and the order comes from `sort_order`.
- **KPI rows.** `KpiGrid` gains an optional `title`. The shell renders two
  titled `KpiGrid` rows for `pe-delivery`, each fed that tag's projects.
- **Filtering.** The shell holds a `tierFilter` next to the existing status
  filter and filters the project list by both.

**Spec:** `docs/superpowers/specs/2026-10-27-pe-delivery-project-tiers-design.md`

**Conventions:**
- **Commands.**
  - `npm run test:unit -- <file>` runs focused unit tests.
  - `npx vitest run <file>` runs a database test.
  - `npx tsc --noEmit` type-checks.
  - `npm run lint` lints.
- **Known baseline.** 2 failures in `tests/security-audit-realtime.test.ts`
  are pre-existing (workspace and status counts); ignore them.
- **Git.** Don't push. Commit at the end of each task. If a commit fails in
  the sandbox, run it with full permissions.

---

### Task 1: Database migration, seed, types and database test

**Files:**
- Create: `supabase/migrations/0036_pe_delivery_project_tiers.sql`
- Create: `tests/pe-delivery-project-tiers-database.test.ts`
- Modify: `supabase/seed.sql` (the PE Development status rows, lines 56-61)
- Modify: `tests/database-contract.test.ts` (the expected `pe-delivery` status list, around lines 165-170)
- Modify: `types/database.ts` (`work_items` Row, Insert and Update)
- Modify: `tests/task-4.test.ts` (the typed `workItems` fixture rows)
- Modify: `package.json` (`test:database` list and `test:unit` excludes)

- [ ] **Step 1: Write the failing database test** at `tests/pe-delivery-project-tiers-database.test.ts`:

```ts
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
```

- [ ] **Step 2: Run it and confirm it fails** (the migration file is missing):

Run: `npx vitest run tests/pe-delivery-project-tiers-database.test.ts`
Expected: FAIL with ENOENT for `0036_pe_delivery_project_tiers.sql`.

- [ ] **Step 3: Write the migration** `supabase/migrations/0036_pe_delivery_project_tiers.sql`:

```sql
-- PE Development: Critical / Standard project tag, an "Upcoming Delivery"
-- status after Development, and On Hold moved after Delayed. Re-runnable.

alter table public.work_items
  add column if not exists project_tier text not null default 'standard';

alter table public.work_items
  drop constraint if exists work_items_project_tier_check;

alter table public.work_items
  add constraint work_items_project_tier_check
    check (project_tier in ('standard', 'critical'));

-- Status sort orders are unique per workspace, so move them out of the way
-- before inserting and reordering.
update public.statuses as s
   set sort_order = s.sort_order + 1000
  from public.workspaces as w
 where s.workspace_id = w.id
   and w.slug = 'pe-delivery';

insert into public.statuses (id, workspace_id, name, color, sort_order, reporting_category)
select
  '20000000-0000-4000-8000-00000000003d',
  w.id,
  'Upcoming Delivery',
  '#23b123',
  (select coalesce(max(s.sort_order), 0) + 1 from public.statuses as s where s.workspace_id = w.id),
  'active'
from public.workspaces as w
where w.slug = 'pe-delivery'
  and not exists (
    select 1
      from public.statuses as s
     where s.workspace_id = w.id
       and lower(btrim(s.name)) = 'upcoming delivery'
  )
on conflict (id) do nothing;

with ranked as (
  select
    s.id,
    row_number() over (
      order by
        case lower(btrim(s.name))
          when 'planning' then 0
          when 'development' then 1
          when 'upcoming delivery' then 2
          when 'testing' then 3
          when 'live' then 4
          when 'delayed' then 5
          when 'on hold' then 6
          else 100 + s.sort_order
        end,
        s.name
    ) - 1 as next_sort
  from public.statuses as s
  join public.workspaces as w on w.id = s.workspace_id
 where w.slug = 'pe-delivery'
)
update public.statuses as s
   set sort_order = ranked.next_sort
  from ranked
 where s.id = ranked.id;
```

- [ ] **Step 4: Run the database test and confirm it passes**

Run: `npx vitest run tests/pe-delivery-project-tiers-database.test.ts`
Expected: 5 tests pass.

- [ ] **Step 5: Update the seed.** In `supabase/seed.sql`, replace the six
  PE Development status rows (lines 56-61) with seven, in the new order:

```sql
  ('20000000-0000-4000-8000-00000000001d', '10000000-0000-4000-8000-000000000008', 'Planning', '#23b123', 0, 'active'),
  ('20000000-0000-4000-8000-00000000001e', '10000000-0000-4000-8000-000000000008', 'Development', '#23b123', 1, 'active'),
  ('20000000-0000-4000-8000-00000000003d', '10000000-0000-4000-8000-000000000008', 'Upcoming Delivery', '#23b123', 2, 'active'),
  ('20000000-0000-4000-8000-00000000001f', '10000000-0000-4000-8000-000000000008', 'Testing', '#246a91', 3, 'active'),
  ('20000000-0000-4000-8000-00000000002a', '10000000-0000-4000-8000-000000000008', 'Live', '#16a34a', 4, 'completed'),
  ('20000000-0000-4000-8000-000000000020', '10000000-0000-4000-8000-000000000008', 'Delayed', '#ef4444', 5, 'delayed'),
  ('20000000-0000-4000-8000-000000000029', '10000000-0000-4000-8000-000000000008', 'On Hold', '#f59e0b', 6, 'risk'),
```

  Keep the row separators consistent with the surrounding rows. If the block
  ends with `;` after the last PE row, keep it on the last row. Then, in
  `tests/database-contract.test.ts`, change the expected `pe-delivery` entries
  in the manual-status list to Planning, Development, Upcoming Delivery,
  Testing, Live, Delayed, On Hold. That test loads migrations up to 0032 over
  the seed, and 0032 doesn't touch the order, so the seed order is what it
  sees.

  Run `npx vitest run tests/database-contract.test.ts`. Expected: PASS. If a
  migration the contract test loads re-sorts the PE statuses by name
  (0022/0023 do), check its output and set the expectation to what it
  actually produces. Record what you saw in your report. Don't change those
  older migrations.

- [ ] **Step 6: Update the types and fixtures.**
  - In `types/database.ts`, in `work_items`, add `project_tier: string;` to
    Row, and `project_tier?: string;` to Insert and Update. Place it
    alphabetically, between `progress` and `readiness_date`.
  - In `tests/task-4.test.ts`, add `project_tier: "standard",` to each typed
    `workItems` fixture row, after `progress`.
  - In `package.json`, add `tests/pe-delivery-project-tiers-database.test.ts`
    to the end of the `test:database` list, and add
    `--exclude tests/pe-delivery-project-tiers-database.test.ts` to the end of
    `test:unit`.
  - Run `npx tsc --noEmit`. It should pass. Fix any other typed `work_items`
    row fixture the same way.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/0036_pe_delivery_project_tiers.sql tests/pe-delivery-project-tiers-database.test.ts supabase/seed.sql tests/database-contract.test.ts types/database.ts tests/task-4.test.ts package.json
git commit -m "feat(pe-delivery): add project tier column and Upcoming Delivery status"
```

---

### Task 2: Data model, save payloads and the "Project type" form field

**Files:**
- Modify: `lib/data/dashboard.ts`
- Modify: `lib/data/work-item-mutations.ts`
- Modify: `components/admin/work-item-form.tsx`
- Test: `tests/task-4.test.ts`, `tests/work-item-mutations.test.ts`, `tests/work-item-form.test.tsx`

- [ ] **Step 1: Write the failing tests.**

In `tests/task-4.test.ts`, inside `describe("dashboard data mapping", ...)`:

```ts
  it("maps the critical project tag and treats everything else as standard", () => {
    const dashboard = mapDashboardRows({
      ...rows,
      workItems: rows.workItems.map((item) =>
        item.id === "project" ? { ...item, project_tier: "critical" } : item),
    });

    expect(dashboard.projects[0].projectTier).toBe("critical");
    expect(projectTierOf(dashboard.projects[0])).toBe("critical");
    expect(dashboard.projects[0].subtasks[0]).not.toHaveProperty("projectTier");
    expect(projectTierOf(dashboard.projects[0].subtasks[0])).toBe("standard");
  });
```

  Also add `projectTierOf` to the existing import from `@/lib/data/dashboard`.

In `tests/work-item-mutations.test.ts`, inside `describe("work item payloads", ...)`:

```ts
  it("sends the project tier only when the form provides it", () => {
    expect(buildWorkItemPayload("workspace-a", null, draft, 0)).not.toHaveProperty("project_tier");
    expect(buildWorkItemPayload("workspace-a", null, { ...draft, projectTier: "critical" }, 0))
      .toMatchObject({ project_tier: "critical" });
  });
```

  Extend the existing `"sends delivery fields in the update payload only when
  provided"` test the same way. The update with delivery fields should also
  pass `projectTier: "standard"` and expect `project_tier: "standard"`. The
  plain `draft` update must have no `project_tier` key.

In `tests/work-item-form.test.tsx`, inside `describe("WorkItemForm", ...)`:

```ts
  it("submits the project type when the field is shown", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(
      <WorkItemForm
        kind="project"
        statuses={statuses}
        showProgress={false}
        showProjectTier
        onSubmit={onSubmit}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByLabelText("Project type")).toHaveValue("standard");
    await user.type(screen.getByLabelText("Title"), "Promo");
    await user.selectOptions(screen.getByLabelText("Project type"), "Critical project");
    await user.click(screen.getByRole("button", { name: "Create project" }));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ projectTier: "critical" }));
  });

  it("prefills a critical project and can switch it back to standard", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(
      <WorkItemForm
        kind="project"
        statuses={statuses}
        initialValue={{
          id: "item-1",
          title: "Promo",
          description: "",
          status: "in-progress",
          statusId: "status-a",
          statusName: "In Progress",
          statusColor: "#123456",
          reportingCategory: "active",
          owner: "Unassigned",
          priority: "medium",
          progress: 0,
          projectTier: "critical",
          sortOrder: 0,
          updatedAt: "",
          syncSource: "local",
          comments: [],
        }}
        showProgress={false}
        showProjectTier
        onSubmit={onSubmit}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByLabelText("Project type")).toHaveValue("critical");
    await user.selectOptions(screen.getByLabelText("Project type"), "Standard project");
    await user.click(screen.getByRole("button", { name: "Save project" }));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ projectTier: "standard" }));
  });

  it("hides the project type and leaves it out of the save by default", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<WorkItemForm kind="project" statuses={statuses} onSubmit={onSubmit} onCancel={vi.fn()} />);

    expect(screen.queryByLabelText("Project type")).not.toBeInTheDocument();
    await user.type(screen.getByLabelText("Title"), "Other");
    await user.click(screen.getByRole("button", { name: "Create project" }));
    expect(onSubmit.mock.calls[0][0]).not.toHaveProperty("projectTier");
  });
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npm run test:unit -- tests/task-4.test.ts tests/work-item-mutations.test.ts tests/work-item-form.test.tsx`
Expected: the new tests fail.

- [ ] **Step 3: Update the data model** in `lib/data/dashboard.ts`:
  1. Above `export interface DashboardWorkItem`, add:

```ts
export type ProjectTier = "standard" | "critical";
```

  2. In `DashboardWorkItem`, after `timeToMarketWd?: number;`, add:

```ts
  projectTier?: ProjectTier;
```

  3. Below `projectMatchesStatusFilter`, add:

```ts
export function projectTierOf(item: Pick<DashboardWorkItem, "projectTier">): ProjectTier {
  return item.projectTier === "critical" ? "critical" : "standard";
}
```

  4. In `mapDashboardRows`'s item mapping, after the `timeToMarketWd` spread, add:

```ts
      ...(item.project_tier === "critical" ? { projectTier: "critical" as const } : {}),
```

- [ ] **Step 4: Update the payloads.** In `lib/data/work-item-mutations.ts`, add this
  line to the end of the object returned by `deliveryPayload`:

```ts
    ...(value.projectTier !== undefined ? { project_tier: value.projectTier } : {}),
```

- [ ] **Step 5: Update the form** in `components/admin/work-item-form.tsx`:
  1. Change the dashboard type import to also bring in `ProjectTier` and
     `projectTierOf`. `projectTierOf` is a value import, so add
     `import { projectTierOf, type ProjectTier } from "@/lib/data/dashboard";`
     or merge it into the existing import as appropriate.
  2. In `WorkItemFormValue`, after `timeToMarketWd?: number | null;`, add
     `projectTier?: ProjectTier;`.
  3. In `WorkItemDraftFields`, after `timeToMarketWd?: string;`, add
     `projectTier?: ProjectTier;`.
  4. In `initialFields`, after `timeToMarketWd`, add
     `projectTier: projectTierOf(value ?? {}),`.
  5. Add `showProjectTier?: boolean;` to `WorkItemFormProps`, and destructure
     `showProjectTier = false,` after `deliveryFields = false,`.
  6. In the `onSubmit({...})` object, after the delivery-fields spread, add:

```ts
        ...(showProjectTier ? { projectTier: fields.projectTier ?? "standard" } : {}),
```

  7. In the JSX, immediately before `{showProgress ? (`, add:

```tsx
      {showProjectTier ? (
        <div className="form-field">
          <label htmlFor="work-item-project-tier">Project type</label>
          <select
            id="work-item-project-tier"
            value={fields.projectTier ?? "standard"}
            onChange={(event) =>
              setField("projectTier", event.target.value === "critical" ? "critical" : "standard")}
          >
            <option value="standard">Standard project</option>
            <option value="critical">Critical project</option>
          </select>
        </div>
      ) : null}
```

- [ ] **Step 6: Run the tests, type-check, and lint**

Run: `npm run test:unit -- tests/task-4.test.ts tests/work-item-mutations.test.ts tests/work-item-form.test.tsx && npx tsc --noEmit && npm run lint`
Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add lib/data/dashboard.ts lib/data/work-item-mutations.ts components/admin/work-item-form.tsx tests/task-4.test.ts tests/work-item-mutations.test.ts tests/work-item-form.test.tsx
git commit -m "feat(pe-delivery): map, save and edit the project tier"
```

---

### Task 3: Two titled KPI rows, tag filtering and shell wiring

**Files:**
- Modify: `components/dashboard/kpi-grid.tsx`
- Modify: `components/dashboard/status-filters.tsx`
- Modify: `components/dashboard/dashboard-shell.tsx`
- Modify: `lib/data/initial-dashboard.ts` (`peDeliveryFixtureStatuses`)
- Modify: `app/globals.css`
- Test: `tests/dashboard-shell.test.tsx`, `tests/admin-dashboard.test.tsx`

- [ ] **Step 1: Write the failing shell test.** In `tests/dashboard-shell.test.tsx`,
  next to the other PE Development tests, add:

```tsx
  it("splits PE Development KPIs into Critical and Standard rows that filter by tag", async () => {
    const user = userEvent.setup();
    const peDashboard = mapFixtureWorkspace({
      slug: "pe-delivery",
      name: "PE Development",
      description: "Promo engine delivery priorities tracked manually by the team.",
      projects: [],
    });
    const statusNamed = (name: string) => {
      const status = peDashboard.statuses.find((candidate) => candidate.name === name);
      if (!status) throw new Error(`missing fixture status ${name}`);
      return { statusId: status.id, statusName: status.name, statusColor: status.color };
    };
    const make = (id: string, title: string, statusName: string, critical: boolean) => ({
      ...dashboard.projects[0],
      ...statusNamed(statusName),
      id,
      title,
      subtasks: [],
      ...(critical ? { projectTier: "critical" as const } : {}),
    });
    render(
      <DashboardShell
        initialDashboard={{
          ...peDashboard,
          projects: [
            make("c1", "Critical build", "Development", true),
            make("s1", "Standard build", "Development", false),
            make("s2", "Standard hold", "On Hold", false),
          ],
        }}
        source="fixture"
      />,
    );

    const overview = screen.getByRole("region", { name: "Workspace status overview" });
    const critical = within(overview).getByRole("region", { name: "Critical Projects" });
    const standard = within(overview).getByRole("region", { name: "Standard Projects" });
    expect(within(critical).getAllByRole("button").map((button) =>
      button.querySelector(".kpi-label")?.textContent)).toEqual([
      "Projects / CRS",
      "Planning",
      "Development",
      "Upcoming Delivery",
      "Testing",
      "Live",
      "Delayed",
      "On Hold",
    ]);
    const count = (row: HTMLElement, label: RegExp) =>
      within(row).getByRole("button", { name: label }).querySelector(".kpi-value")?.textContent;
    expect(count(critical, /^Projects \/ CRS/)).toBe("1");
    expect(count(critical, /^Development/)).toBe("1");
    expect(count(critical, /^On Hold/)).toBe("0");
    expect(count(standard, /^Projects \/ CRS/)).toBe("2");
    expect(count(standard, /^Development/)).toBe("1");
    expect(count(standard, /^On Hold/)).toBe("1");

    await user.click(within(critical).getByRole("button", { name: /^Development/ }));
    expect(within(critical).getByRole("button", { name: /^Development/ }))
      .toHaveAttribute("aria-pressed", "true");
    expect(within(standard).getByRole("button", { name: /^Development/ }))
      .toHaveAttribute("aria-pressed", "false");
    expect(screen.getByText("1 visible")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "View Critical build details" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "View Standard build details" })).not.toBeInTheDocument();

    const statusFilters = screen.getByLabelText("Filter projects by status");
    await user.click(within(statusFilters).getByRole("button", { name: "On Hold" }));
    expect(screen.getByText("0 visible")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Clear Critical projects filter" }));
    expect(screen.getByText("1 visible")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "View Standard hold details" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Clear Critical projects filter" })).not.toBeInTheDocument();

    await user.click(within(standard).getByRole("button", { name: /^Projects \/ CRS/ }));
    expect(screen.getByText("2 visible")).toBeInTheDocument();
    await user.click(within(standard).getByRole("button", { name: /^Projects \/ CRS/ }));
    expect(screen.getByText("3 visible")).toBeInTheDocument();
  });
```

  Also update the existing PE Development test (`"labels PE Development all
  filter as Projects / CRS and shows effort notes"`): it now finds two
  "Projects / CRS" KPI buttons. Replace
  `expect(within(overview).getByRole("button", { name: /Projects \/ CRS/i })).toBeInTheDocument();`
  with:

```tsx
    expect(within(overview).getAllByRole("button", { name: /Projects \/ CRS/i })).toHaveLength(2);
```

  Keep its other assertions. The `.not.toBeInTheDocument()` check for
  "All Projects" stays valid. If the card heading's accessible role or name
  differs from what this test expects (for example, the project title isn't
  a heading named exactly by the title), adjust the selector to match how the
  surrounding tests find card titles. Keep the intent of each assertion.

- [ ] **Step 2: Write the failing admin test.** In `tests/admin-dashboard.test.tsx`,
  next to the PE Development editor test added for the delivery fields,
  follow the same setup and add a test with two parts:
  - "New Project" on `pe-delivery` shows a "Project type" select defaulting to
    "standard".
  - Opening the subtask form ("Add subtask" in a project's details) shows no
    "Project type" field.

  If opening the subtask form is impractical in that harness, cover the
  project part only and say so in your report.

- [ ] **Step 3: Run the tests and confirm they fail**

Run: `npm run test:unit -- tests/dashboard-shell.test.tsx tests/admin-dashboard.test.tsx`
Expected: the new tests fail.

- [ ] **Step 4: Update the fixture statuses.** In `lib/data/initial-dashboard.ts`,
  replace `peDeliveryFixtureStatuses` with:

```ts
const peDeliveryFixtureStatuses: FixtureStatusDefinition[] = [
  { legacyStatus: "in-progress", name: "Planning", category: "active", color: "#23b123", key: "planning" },
  { legacyStatus: "in-progress", name: "Development", category: "active", color: "#23b123", key: "development" },
  { legacyStatus: "in-progress", name: "Upcoming Delivery", category: "active", color: "#23b123", key: "upcoming-delivery" },
  { legacyStatus: "in-progress", name: "Testing", category: "active", color: "#246a91", key: "testing" },
  { legacyStatus: "completed", name: "Live", category: "completed", color: "#16a34a", key: "live" },
  { legacyStatus: "delayed", name: "Delayed", category: "delayed", color: "#ef4444", key: "delayed" },
  { legacyStatus: "at-risk", name: "On Hold", category: "risk", color: "#f59e0b", key: "on-hold" },
];
```

- [ ] **Step 5: Give `KpiGrid` an optional title.** Replace the body of
  `components/dashboard/kpi-grid.tsx` with:

```tsx
import type { DashboardProject, DashboardStatus } from "@/lib/data/dashboard";
import { projectMatchesStatusFilter } from "@/lib/data/dashboard";
import type { StatusFilter } from "@/components/dashboard/status-filters";

interface KpiGridProps {
  statuses: DashboardStatus[];
  projects: DashboardProject[];
  activeFilter: StatusFilter | null;
  onSelect: (filter: StatusFilter) => void;
  allLabel?: string;
  title?: string;
}

export function KpiGrid({
  statuses,
  projects,
  activeFilter,
  onSelect,
  allLabel = "All Projects",
  title,
}: KpiGridProps) {
  // Derived from live workspace.statuses / projects so admin add/rename/reorder
  // and realtime updates show up in the KPI cards automatically.
  const metrics = [
    {
      value: "all" as StatusFilter,
      label: allLabel,
      count: projects.length,
      color: "var(--orange)",
      meta: "Across this workspace",
    },
    ...statuses.map((status) => ({
      value: status.id as StatusFilter,
      label: status.name,
      count: projects.filter((project) => projectMatchesStatusFilter(project, status.id)).length,
      color: status.color,
      meta: "Matching this status",
    })),
  ];

  const cards = metrics.map((metric) => {
    const active = activeFilter === metric.value;
    return (
      <button
        type="button"
        className="kpi-card kpi-card-button"
        data-active={active}
        aria-pressed={active}
        key={metric.value}
        style={{ ["--kpi-accent" as string]: metric.color }}
        onClick={() => onSelect(metric.value)}
      >
        <p className="kpi-label">{metric.label}</p>
        <p className="kpi-value">{metric.count}</p>
        <p className="kpi-meta">{metric.meta}</p>
      </button>
    );
  });

  if (!title) {
    return (
      <section className="kpi-grid kpi-grid-status" aria-label="Workspace status overview">
        {cards}
      </section>
    );
  }

  const headingId = `kpi-row-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  return (
    <section className="kpi-row" aria-labelledby={headingId}>
      <h2 className="kpi-row-title" id={headingId}>{title}</h2>
      <div className="kpi-grid kpi-grid-status">{cards}</div>
    </section>
  );
}
```

- [ ] **Step 6: Let `StatusFilters` take extra chips.** In
  `components/dashboard/status-filters.tsx`:
  - Import `type ReactNode` from `react`.
  - Add `children?: ReactNode;` to the props, and destructure it.
  - Render `{children}` after the mapped buttons, inside the `.filters` div.

- [ ] **Step 7: Wire up the shell** in `components/dashboard/dashboard-shell.tsx`:
  1. Import `projectTierOf` and `type ProjectTier` from `@/lib/data/dashboard`.
     Extend the existing import.
  2. At module level, below the imports, add:

```ts
const PROJECT_TIER_ROWS: ReadonlyArray<{ tier: ProjectTier; title: string; chip: string }> = [
  { tier: "critical", title: "Critical Projects", chip: "Critical projects" },
  { tier: "standard", title: "Standard Projects", chip: "Standard projects" },
];
```

  3. In `optimisticItem`, after the `timeToMarketWd` spread, add:

```ts
    ...(value.projectTier ? { projectTier: value.projectTier } : {}),
```

     Keep explicit `"standard"` here, so that an optimistic update merged over
     a critical project (`{ ...project, ...updated }`) switches it back to
     Standard right away.

  4. In `EditorDialog`'s `<WorkItemForm>`, add:

```tsx
        showProjectTier={isPeDeliveryWorkspace(dashboard.slug) && editor.kind === "project"}
```

  5. Next to `const [activeFilter, setActiveFilter] = ...`, add:

```ts
  const [tierFilter, setTierFilter] = useState<"all" | ProjectTier>("all");
```

  6. After `effectiveFilter` is computed, add:

```ts
  const usesProjectTiers = isPeDeliveryWorkspace(workspace.slug);
  const effectiveTier = usesProjectTiers ? tierFilter : "all";
  const activeTierRow = PROJECT_TIER_ROWS.find((row) => row.tier === effectiveTier);

  function selectTierKpi(tier: ProjectTier, filter: StatusFilter) {
    if (effectiveTier === tier && effectiveFilter === filter) {
      setTierFilter("all");
      setActiveFilter("all");
      return;
    }
    setTierFilter(tier);
    setActiveFilter(filter);
  }
```

  7. In `visibleProjects`, filter by tag after the status filter. Rename the
     intermediate value and use it in the rest of the memo:

```ts
    const byStatus = effectiveFilter === "all"
      ? workspace.projects
      : workspace.projects.filter((project) =>
          projectMatchesStatusFilter(project, effectiveFilter));
    const byTier = effectiveTier === "all"
      ? byStatus
      : byStatus.filter((project) => projectTierOf(project) === effectiveTier);

    if (!isPeLiveFilter || !liveStatus) return byTier;

    return byTier.filter((project) => {
```

     Add `effectiveTier` to the memo's dependency list.

  8. Replace the `<KpiGrid ... />` element with:

```tsx
        {usesProjectTiers ? (
          <div className="kpi-rows" role="region" aria-label="Workspace status overview">
            {PROJECT_TIER_ROWS.map((row) => (
              <KpiGrid
                key={row.tier}
                title={row.title}
                statuses={workspace.statuses}
                projects={workspace.projects.filter((project) => projectTierOf(project) === row.tier)}
                activeFilter={effectiveTier === row.tier ? effectiveFilter : null}
                onSelect={(filter) => selectTierKpi(row.tier, filter)}
                allLabel={allFilterLabel(workspace.slug)}
              />
            ))}
          </div>
        ) : (
          <KpiGrid
            statuses={workspace.statuses}
            projects={workspace.projects}
            activeFilter={effectiveFilter}
            onSelect={setActiveFilter}
            allLabel={allFilterLabel(workspace.slug)}
          />
        )}
```

  9. Replace the self-closing `<StatusFilters ... />` with one that renders
     the tag chip:

```tsx
              <StatusFilters
                activeFilter={effectiveFilter}
                statuses={workspace.statuses}
                onChange={setActiveFilter}
                allLabel={allFilterLabel(workspace.slug)}
              >
                {activeTierRow ? (
                  <button
                    type="button"
                    className="filter-button filter-tag-chip"
                    data-active="true"
                    aria-label={`Clear ${activeTierRow.chip} filter`}
                    onClick={() => setTierFilter("all")}
                  >
                    {activeTierRow.chip} ×
                  </button>
                ) : null}
              </StatusFilters>
```

- [ ] **Step 8: Add the CSS.** In `app/globals.css`, after the `.kpi-grid-status { ... }`
  rule near the top (not the one inside the media query), add:

```css
.kpi-rows {
  margin-bottom: 32px;
}

.kpi-row + .kpi-row {
  margin-top: 22px;
}

.kpi-row-title {
  margin: 0 0 12px;
  font-size: 18px;
}

.kpi-row .kpi-grid {
  margin-bottom: 0;
}

.filter-tag-chip {
  border-style: dashed;
}
```

- [ ] **Step 9: Run the full unit suite, type-check, and lint**

Run: `npm run test:unit && npx tsc --noEmit && npm run lint`
Expected: all pass.

- [ ] **Step 10: Commit**

```bash
git add components/dashboard/kpi-grid.tsx components/dashboard/status-filters.tsx components/dashboard/dashboard-shell.tsx lib/data/initial-dashboard.ts app/globals.css tests/dashboard-shell.test.tsx tests/admin-dashboard.test.tsx
git commit -m "feat(pe-delivery): Critical and Standard KPI rows with tag filtering"
```

---

### Task 4: Verification

- [ ] `npm run lint && npx tsc --noEmit && npm run test:unit`. All pass.
- [ ] `npm run test:database -- --maxWorkers=2`. Only the known baseline
  failures may fail. Re-run any timeout flake alone.
- [ ] `npm run build`. It must succeed.
- [ ] Do a manual check in fixture mode. Open `/pe-delivery` and confirm:
  - two titled rows with the cards in the new order
  - clicking a card filters the list
  - the tag chip clears the tag filter

  Take a screenshot.
