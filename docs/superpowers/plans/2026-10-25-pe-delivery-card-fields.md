# PE Development card fields: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task.
> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On PE Development (`pe-delivery`), project cards and subtasks show and
edit five fields: Start Date, Deployment Date, Readiness Date, Team Efforts, and
Time to market efforts. "Target" is removed.

**Architecture:** Deployment Date reuses `work_items.end_date`. Three new
nullable columns hold the rest. The form and the card each get a PE-only mode:
the form through a `deliveryFields` prop, the card through
`scheduleMode="delivery"`. Both are switched on by the existing
`isPeDeliveryWorkspace(slug)`. Other dashboards are untouched; the new values
are only sent when `deliveryFields` is on.

**Tech stack:** Next.js 16, React 19, TypeScript, Supabase/Postgres, Vitest +
Testing Library, PGlite.

**Spec:** `docs/superpowers/specs/2026-10-25-pe-delivery-card-fields-design.md`

**Conventions:**
- **Commands.**
  - `npm run test:unit -- <file>` runs focused unit tests.
  - `npx vitest run <file>` runs a database test.
  - `npx tsc --noEmit` type-checks.
  - `npm run lint` lints.
- **Known baseline.** 2 failures in `tests/security-audit-realtime.test.ts`:
  they expect 12 workspaces and 54 statuses, and find 13 and 60. They are not
  ours; ignore them.
- **Git.** Don't push. Commit at the end of each task.

---

### Task 1: Database migration, types, and database test

**Files:**
- Create: `supabase/migrations/0035_pe_delivery_card_fields.sql`
- Create: `tests/pe-delivery-card-fields-database.test.ts`
- Modify: `types/database.ts` (the `work_items` Row/Insert/Update)
- Modify: `package.json` (the `test:unit` exclude list and the `test:database` list)
- Modify: `tests/task-4.test.ts` (the `work_items` fixture rows gain the new columns)

- [ ] **Step 1: Write the failing database test** in `tests/pe-delivery-card-fields-database.test.ts`:

```ts
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

  it.each([
    ["a readiness date before the deployment date", "readiness_date = '2026-02-28'"],
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
```

- [ ] **Step 2: Run it and confirm it fails** (the migration file is missing):

Run: `npx vitest run tests/pe-delivery-card-fields-database.test.ts`
Expected: FAIL with ENOENT for `0035_pe_delivery_card_fields.sql`.

- [ ] **Step 3: Write the migration** `supabase/migrations/0035_pe_delivery_card_fields.sql`:

```sql
-- PE Development cards: Deployment Date (stored in end_date), Readiness Date,
-- and Team / Time to market efforts in working days.

-- Discard the retired "Target" dates once. This only runs while readiness_date
-- does not exist yet, so re-running the file never clears Deployment Dates.
do $$
begin
  if not exists (
    select 1
      from information_schema.columns
     where table_schema = 'public'
       and table_name = 'work_items'
       and column_name = 'readiness_date'
  ) then
    update public.work_items as item
       set end_date = null
      from public.workspaces as workspace
     where workspace.id = item.workspace_id
       and workspace.slug = 'pe-delivery'
       and item.end_date is not null;
  end if;
end;
$$;

alter table public.work_items
  add column if not exists readiness_date date,
  add column if not exists team_effort_wd numeric(5, 1),
  add column if not exists time_to_market_wd numeric(5, 1);

alter table public.work_items
  drop constraint if exists work_items_readiness_date_order,
  drop constraint if exists work_items_team_effort_wd_nonnegative,
  drop constraint if exists work_items_time_to_market_wd_nonnegative;

alter table public.work_items
  add constraint work_items_readiness_date_order check (
    readiness_date is null
    or (
      (end_date is null or readiness_date >= end_date)
      and (start_date is null or readiness_date >= start_date)
    )
  ),
  add constraint work_items_team_effort_wd_nonnegative
    check (team_effort_wd is null or team_effort_wd >= 0),
  add constraint work_items_time_to_market_wd_nonnegative
    check (time_to_market_wd is null or time_to_market_wd >= 0);
```

- [ ] **Step 4: Run the database test and confirm it passes**

Run: `npx vitest run tests/pe-delivery-card-fields-database.test.ts`
Expected: 7 tests pass.

- [ ] **Step 5: Register the test in `package.json`.** Add
  `tests/pe-delivery-card-fields-database.test.ts` to the end of the
  `test:database` file list. Add
  `--exclude tests/pe-delivery-card-fields-database.test.ts` to the end of
  `test:unit`.

- [ ] **Step 6: Update `types/database.ts`.** In `work_items`, add these keys in
  alphabetical position: `readiness_date` goes between `progress` and
  `release_tag`; the other two go between `sync_source` and `title`.
  - Row:
    - `readiness_date: string | null;`
    - `team_effort_wd: number | null;`
    - `time_to_market_wd: number | null;`
  - Insert and Update:
    - `readiness_date?: string | null;`
    - `team_effort_wd?: number | null;`
    - `time_to_market_wd?: number | null;`

- [ ] **Step 7: Fix the typed fixtures.** In `tests/task-4.test.ts`, add
  `readiness_date: null, team_effort_wd: null, time_to_market_wd: null,` to each
  of the three `workItems` rows, after `release_tag: null,`. Then run
  `npx tsc --noEmit`. Expected: no errors. If any other fixture typed as a
  `work_items` row is reported, add the same three null fields there too.

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations/0035_pe_delivery_card_fields.sql tests/pe-delivery-card-fields-database.test.ts types/database.ts package.json tests/task-4.test.ts
git commit -m "feat(pe-delivery): add readiness date and effort columns"
```

---

### Task 2: Data model, mapping, and save payloads

**Files:**
- Modify: `lib/data/dashboard.ts` (the `DashboardWorkItem` interface and `mapItem`)
- Modify: `components/admin/work-item-form.tsx` (only the `WorkItemFormValue` interface)
- Modify: `lib/data/work-item-mutations.ts` (`buildWorkItemPayload` and `updatePayload`)
- Test: `tests/task-4.test.ts` and `tests/work-item-mutations.test.ts`

- [ ] **Step 1: Write the failing tests.**

In `tests/task-4.test.ts`, inside `describe("dashboard data mapping", ...)`, add:

```ts
  it("maps PE Development delivery fields", () => {
    const dashboard = mapDashboardRows({
      ...rows,
      workItems: rows.workItems.map((item) =>
        item.id === "project"
          ? {
              ...item,
              end_date: "2026-02-01",
              readiness_date: "2026-02-10",
              team_effort_wd: 2.5,
              time_to_market_wd: 12,
            }
          : item),
    });

    expect(dashboard.projects[0]).toMatchObject({
      endDate: "2026-02-01",
      readinessDate: "2026-02-10",
      teamEffortWd: 2.5,
      timeToMarketWd: 12,
    });
    expect(dashboard.projects[0].subtasks[0]).not.toHaveProperty("readinessDate");
    expect(dashboard.projects[0].subtasks[0]).not.toHaveProperty("teamEffortWd");
    expect(dashboard.projects[0].subtasks[0]).not.toHaveProperty("timeToMarketWd");
  });

  it("maps a zero effort and numeric strings from PostgREST", () => {
    const dashboard = mapDashboardRows({
      ...rows,
      workItems: rows.workItems.map((item) =>
        item.id === "project"
          ? {
              ...item,
              team_effort_wd: 0,
              time_to_market_wd: "3.5" as unknown as number,
            }
          : item),
    });

    expect(dashboard.projects[0].teamEffortWd).toBe(0);
    expect(dashboard.projects[0].timeToMarketWd).toBe(3.5);
  });
```

In `tests/work-item-mutations.test.ts`, inside `describe("work item payloads", ...)`, add:

```ts
  it("sends delivery fields only when the form provides them", () => {
    expect(buildWorkItemPayload("workspace-a", null, draft, 0)).not.toHaveProperty("readiness_date");
    expect(buildWorkItemPayload("workspace-a", null, {
      ...draft,
      readinessDate: "2026-08-05",
      teamEffortWd: 2.5,
      timeToMarketWd: null,
    }, 0)).toMatchObject({
      readiness_date: "2026-08-05",
      team_effort_wd: 2.5,
      time_to_market_wd: null,
    });
  });
```

Also add a test that `updateWorkItem` sends the delivery fields in its update
payload. Copy the existing update test (`"atomically matches updated_at for
update and delete"`) and its fake client, pass
`{ ...draft, readinessDate: "2026-08-05", teamEffortWd: 1, timeToMarketWd: 3 }`,
and assert that the captured update payload contains
`readiness_date: "2026-08-05"`, `team_effort_wd: 1`, and `time_to_market_wd: 3`.
Also assert that an update with plain `draft` has no `readiness_date` key.

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npm run test:unit -- tests/task-4.test.ts tests/work-item-mutations.test.ts`
Expected: the new tests fail, because the properties are missing.

- [ ] **Step 3: Extend `DashboardWorkItem`** in `lib/data/dashboard.ts`. Add these
  after `releaseTag?: string;`:

```ts
  readinessDate?: string;
  teamEffortWd?: number;
  timeToMarketWd?: number;
```

- [ ] **Step 4: Map the columns** in `mapItem`. Add these right after the
  `...(item.release_tag ? ...)` line:

```ts
      ...(item.readiness_date ? { readinessDate: item.readiness_date } : {}),
      ...(item.team_effort_wd !== null && item.team_effort_wd !== undefined
        ? { teamEffortWd: Number(item.team_effort_wd) }
        : {}),
      ...(item.time_to_market_wd !== null && item.time_to_market_wd !== undefined
        ? { timeToMarketWd: Number(item.time_to_market_wd) }
        : {}),
```

- [ ] **Step 5: Extend `WorkItemFormValue`** in `components/admin/work-item-form.tsx`.
  Add these after `releaseTag: string | null;`:

```ts
  readinessDate?: string | null;
  teamEffortWd?: number | null;
  timeToMarketWd?: number | null;
```

- [ ] **Step 6: Add the payloads** in `lib/data/work-item-mutations.ts`. Add a helper
  above `buildWorkItemPayload`:

```ts
function deliveryPayload(value: WorkItemFormValue) {
  return {
    ...(value.readinessDate !== undefined ? { readiness_date: value.readinessDate } : {}),
    ...(value.teamEffortWd !== undefined ? { team_effort_wd: value.teamEffortWd } : {}),
    ...(value.timeToMarketWd !== undefined ? { time_to_market_wd: value.timeToMarketWd } : {}),
  };
}
```

  Then add `...deliveryPayload(value),` after `release_tag: value.releaseTag,` in
  both `buildWorkItemPayload` (before `sort_order`) and `updatePayload`.

- [ ] **Step 7: Run the tests, type-check, and lint**

Run: `npm run test:unit -- tests/task-4.test.ts tests/work-item-mutations.test.ts && npx tsc --noEmit && npm run lint`
Expected: all pass. The existing exact-match payload test still passes, because
`draft` has no delivery keys.

- [ ] **Step 8: Commit**

```bash
git add lib/data/dashboard.ts components/admin/work-item-form.tsx lib/data/work-item-mutations.ts tests/task-4.test.ts tests/work-item-mutations.test.ts
git commit -m "feat(pe-delivery): map and save readiness date and efforts"
```

---

### Task 3: Card formatting helpers and the PE Development card layout

**Files:**
- Create: `lib/dashboard/card-format.ts`
- Create: `tests/card-format.test.ts`
- Modify: `components/dashboard/project-card.tsx`
- Test: `tests/project-card.test.tsx`

- [ ] **Step 1: Write the failing helper tests** in `tests/card-format.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  deliverySummary,
  formatCardDate,
  formatWorkingDays,
  parseWorkingDays,
} from "@/lib/dashboard/card-format";

describe("formatCardDate", () => {
  it("formats ISO dates and falls back when empty or invalid", () => {
    expect(formatCardDate("2026-04-15")).toBe("Apr 15, 2026");
    expect(formatCardDate(undefined)).toBe("Not scheduled");
    expect(formatCardDate("nope")).toBe("Not scheduled");
  });
});

describe("formatWorkingDays", () => {
  it.each([
    [undefined, "Not set"],
    [0, "0 WDs"],
    [1, "1 WD"],
    [2.5, "2.5 WDs"],
    [8, "8 WDs"],
  ])("formats %s as %s", (value, expected) => {
    expect(formatWorkingDays(value)).toBe(expected);
  });
});

describe("parseWorkingDays", () => {
  it.each([
    ["", null],
    ["   ", null],
    ["0", 0],
    ["2.5", 2.5],
    [" 10 ", 10],
    ["9999.9", 9999.9],
  ])("accepts %j", (text, expected) => {
    expect(parseWorkingDays(text)).toBe(expected);
  });

  it.each(["1.25", "-1", "10000", "abc", "1.", ".5", "1e2"])("rejects %j", (text) => {
    expect(parseWorkingDays(text)).toBeUndefined();
  });
});

describe("deliverySummary", () => {
  it("lists only the fields that are set", () => {
    expect(deliverySummary({
      startDate: "2026-04-01",
      readinessDate: "2026-04-20",
      teamEffortWd: 1,
      timeToMarketWd: 12.5,
    })).toBe("Start Apr 1, 2026 · Readiness Apr 20, 2026 · Team 1 WD · Time to market 12.5 WDs");
    expect(deliverySummary({ endDate: "2026-04-10", teamEffortWd: 0 }))
      .toBe("Deployment Apr 10, 2026 · Team 0 WDs");
    expect(deliverySummary({})).toBe("");
  });
});
```

- [ ] **Step 2: Run it and confirm it fails** because the module is missing:

Run: `npm run test:unit -- tests/card-format.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Create `lib/dashboard/card-format.ts`:**

```ts
import type { DashboardWorkItem } from "@/lib/data/dashboard";

const dateFormatter = new Intl.DateTimeFormat("en", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

export function formatCardDate(date?: string) {
  if (!date) return "Not scheduled";
  const parsed = new Date(`${date}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? "Not scheduled" : dateFormatter.format(parsed);
}

export const WORKING_DAYS_ERROR =
  "Enter working days as a number from 0 to 9999.9 with at most one decimal.";

const WORKING_DAYS_PATTERN = /^\d{1,4}(\.\d)?$/;

/** Blank text is `null`; text that is not a valid working-day amount is `undefined`. */
export function parseWorkingDays(text: string): number | null | undefined {
  const trimmed = text.trim();
  if (!trimmed) return null;
  return WORKING_DAYS_PATTERN.test(trimmed) ? Number(trimmed) : undefined;
}

export function formatWorkingDays(value?: number) {
  if (value === undefined) return "Not set";
  const amount = Number.isInteger(value) ? String(value) : value.toFixed(1);
  return `${amount} ${value === 1 ? "WD" : "WDs"}`;
}

export function deliverySummary(
  item: Pick<
    DashboardWorkItem,
    "startDate" | "endDate" | "readinessDate" | "teamEffortWd" | "timeToMarketWd"
  >,
) {
  return [
    item.startDate ? `Start ${formatCardDate(item.startDate)}` : null,
    item.endDate ? `Deployment ${formatCardDate(item.endDate)}` : null,
    item.readinessDate ? `Readiness ${formatCardDate(item.readinessDate)}` : null,
    item.teamEffortWd !== undefined ? `Team ${formatWorkingDays(item.teamEffortWd)}` : null,
    item.timeToMarketWd !== undefined
      ? `Time to market ${formatWorkingDays(item.timeToMarketWd)}`
      : null,
  ].filter(Boolean).join(" · ");
}
```

- [ ] **Step 4: Run the helper tests and confirm they pass**

Run: `npm run test:unit -- tests/card-format.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing card test.** In `tests/project-card.test.tsx`, add:

```ts
describe("ProjectCard PE Development delivery fields", () => {
  it("shows the five delivery fields instead of Target", () => {
    render(
      <ProjectCard
        project={makeProject({
          startDate: "2026-03-01",
          endDate: "2026-04-15",
          readinessDate: "2026-04-20",
          teamEffortWd: 8,
          timeToMarketWd: 12.5,
        })}
        onOpen={vi.fn()}
        scheduleMode="delivery"
      />,
    );

    const field = (label: string) => screen.getByText(label).nextElementSibling;
    expect(field("Start Date")).toHaveTextContent("Mar 1, 2026");
    expect(field("Deployment Date")).toHaveTextContent("Apr 15, 2026");
    expect(field("Readiness Date")).toHaveTextContent("Apr 20, 2026");
    expect(field("Team Efforts")).toHaveTextContent("8 WDs");
    expect(field("Time to market efforts")).toHaveTextContent("12.5 WDs");
    expect(screen.queryByText("Target")).not.toBeInTheDocument();
  });

  it("shows placeholders when delivery fields are empty", () => {
    render(
      <ProjectCard
        project={makeProject({ startDate: undefined, endDate: undefined })}
        onOpen={vi.fn()}
        scheduleMode="delivery"
      />,
    );

    expect(screen.getByText("Readiness Date").nextElementSibling).toHaveTextContent("Not scheduled");
    expect(screen.getByText("Team Efforts").nextElementSibling).toHaveTextContent("Not set");
    expect(screen.getByText("Time to market efforts").nextElementSibling).toHaveTextContent("Not set");
  });
});
```

- [ ] **Step 6: Run it and confirm it fails**

Run: `npm run test:unit -- tests/project-card.test.tsx`
Expected: the new tests fail, and type-checking flags `"delivery"` as an
invalid `scheduleMode`.

- [ ] **Step 7: Update `components/dashboard/project-card.tsx`:**
  1. Add `import { formatCardDate, formatWorkingDays } from "@/lib/dashboard/card-format";`.
  2. Delete the local `dateFormatter` and `formatDate`. Replace every
     `formatDate(` call with `formatCardDate(`, including the team-track dates.
  3. Change the prop type to `scheduleMode?: "dates" | "ops-health" | "delivery";`.
  4. In the `<dl className="project-dates">` block, replace the
     `scheduleMode === "ops-health" ? (...) : (...)` ternary with a three-way
     ternary. Keep the ops-health branch and the final dates branch exactly as
     they are, and insert this branch between them:

```tsx
          ) : scheduleMode === "delivery" ? (
            <>
              <div>
                <dt>Start Date</dt>
                <dd>{formatCardDate(project.startDate)}</dd>
              </div>
              <div>
                <dt>Deployment Date</dt>
                <dd>{formatCardDate(project.endDate)}</dd>
              </div>
              <div>
                <dt>Readiness Date</dt>
                <dd>{formatCardDate(project.readinessDate)}</dd>
              </div>
              <div>
                <dt>Team Efforts</dt>
                <dd>{formatWorkingDays(project.teamEffortWd)}</dd>
              </div>
              <div>
                <dt>Time to market efforts</dt>
                <dd>{formatWorkingDays(project.timeToMarketWd)}</dd>
              </div>
            </>
```

- [ ] **Step 8: Run the tests, type-check, and lint**

Run: `npm run test:unit -- tests/card-format.test.ts tests/project-card.test.tsx tests/dashboard-shell.test.tsx && npx tsc --noEmit && npm run lint`
Expected: all pass.

- [ ] **Step 9: Commit**

```bash
git add lib/dashboard/card-format.ts tests/card-format.test.ts components/dashboard/project-card.tsx tests/project-card.test.tsx
git commit -m "feat(pe-delivery): show delivery fields on project cards"
```

---

### Task 4: Form fields and validation

**Files:**
- Modify: `components/admin/work-item-form.tsx`
- Test: `tests/work-item-form.test.tsx`

- [ ] **Step 1: Write the failing tests.** In `tests/work-item-form.test.tsx`, inside
  `describe("validateWorkItemDraft", ...)`, add:

```ts
  describe("delivery fields", () => {
    const delivery = { deliveryFields: true };

    it("names Deployment Date when it is before the Start Date", () => {
      expect(validateWorkItemDraft({
        ...emptyDraft,
        startDate: "2026-07-20",
        endDate: "2026-07-19",
      }, "dates", delivery).endDate).toBe("Deployment Date must be on or after the Start Date.");
    });

    it("rejects a Readiness Date before the Deployment Date", () => {
      expect(validateWorkItemDraft({
        ...emptyDraft,
        startDate: "2026-07-01",
        endDate: "2026-07-20",
        readinessDate: "2026-07-19",
      }, "dates", delivery).readinessDate)
        .toBe("Readiness Date must be on or after the Deployment Date.");
    });

    it("rejects a Readiness Date before the Start Date when Deployment is empty", () => {
      expect(validateWorkItemDraft({
        ...emptyDraft,
        startDate: "2026-07-01",
        readinessDate: "2026-06-30",
      }, "dates", delivery).readinessDate)
        .toBe("Readiness Date must be on or after the Start Date.");
    });

    it.each(["1.25", "-1", "10000", "abc"])("rejects effort %j", (value) => {
      const errors = validateWorkItemDraft({
        ...emptyDraft,
        teamEffortWd: value,
        timeToMarketWd: value,
      }, "dates", delivery);
      const message = "Enter working days as a number from 0 to 9999.9 with at most one decimal.";
      expect(errors.teamEffortWd).toBe(message);
      expect(errors.timeToMarketWd).toBe(message);
    });

    it("accepts valid delivery values", () => {
      expect(validateWorkItemDraft({
        ...emptyDraft,
        startDate: "2026-07-01",
        endDate: "2026-07-10",
        readinessDate: "2026-07-10",
        teamEffortWd: "2.5",
        timeToMarketWd: "",
      }, "dates", delivery)).toEqual({});
    });
  });
```

Inside `describe("WorkItemForm", ...)`, add:

```ts
  it("submits PE Development delivery fields", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(
      <WorkItemForm
        kind="subtask"
        statuses={statuses}
        startDateLabel="Start Date"
        endDateLabel="Deployment Date"
        showProgress={false}
        deliveryFields
        onSubmit={onSubmit}
        onCancel={vi.fn()}
      />,
    );

    await user.type(screen.getByLabelText("Title"), "CR 12");
    await user.type(screen.getByLabelText("Start Date"), "2026-07-01");
    await user.type(screen.getByLabelText("Deployment Date"), "2026-07-10");
    await user.type(screen.getByLabelText("Readiness Date"), "2026-07-15");
    await user.type(screen.getByLabelText("Team Efforts (WDs)"), "2.5");
    await user.type(screen.getByLabelText("Time to market efforts (WDs)"), "12");
    await user.click(screen.getByRole("button", { name: "Create subtask" }));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      startDate: "2026-07-01",
      endDate: "2026-07-10",
      readinessDate: "2026-07-15",
      teamEffortWd: 2.5,
      timeToMarketWd: 12,
    }));
  });

  it("prefills delivery fields and clears empty efforts to null", async () => {
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
          readinessDate: "2026-07-15",
          teamEffortWd: 8,
          sortOrder: 0,
          updatedAt: "",
          syncSource: "local",
          comments: [],
        }}
        showProgress={false}
        deliveryFields
        onSubmit={onSubmit}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByLabelText("Readiness Date")).toHaveValue("2026-07-15");
    expect(screen.getByLabelText("Team Efforts (WDs)")).toHaveValue(8);
    await user.clear(screen.getByLabelText("Team Efforts (WDs)"));
    await user.click(screen.getByRole("button", { name: "Save project" }));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      readinessDate: "2026-07-15",
      teamEffortWd: null,
      timeToMarketWd: null,
    }));
  });

  it("leaves delivery fields out of other dashboards' saves", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<WorkItemForm kind="project" statuses={statuses} onSubmit={onSubmit} onCancel={vi.fn()} />);

    expect(screen.queryByLabelText("Readiness Date")).not.toBeInTheDocument();
    await user.type(screen.getByLabelText("Title"), "Other");
    await user.click(screen.getByRole("button", { name: "Create project" }));
    expect(onSubmit.mock.calls[0][0]).not.toHaveProperty("readinessDate");
    expect(onSubmit.mock.calls[0][0]).not.toHaveProperty("teamEffortWd");
  });
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npm run test:unit -- tests/work-item-form.test.tsx`
Expected: the new tests fail, with unknown fields or prop, and missing labels.

- [ ] **Step 3: Update the types and validation** in `components/admin/work-item-form.tsx`:

  1. Add `import { parseWorkingDays, WORKING_DAYS_ERROR } from "@/lib/dashboard/card-format";`.
  2. Add optional keys to `WorkItemDraftFields`, after `releaseTag: string;`:

```ts
  readinessDate?: string;
  teamEffortWd?: string;
  timeToMarketWd?: string;
```

  3. Add `deliveryFields?: boolean;` to the `options` type of
     `validateWorkItemDraft`.
  4. Replace the `if (!options.requireTeamTracks && scheduleMode === "dates") { ... }`
     body (only the dates branch, not the `else if` ops-health branch) with:

```ts
  if (!options.requireTeamTracks && scheduleMode === "dates") {
    if (fields.startDate && fields.endDate && fields.endDate < fields.startDate) {
      errors.endDate = options.deliveryFields
        ? "Deployment Date must be on or after the Start Date."
        : "End date must be on or after the start date.";
    }
    if (options.deliveryFields) {
      const readinessDate = fields.readinessDate ?? "";
      if (readinessDate && fields.endDate && readinessDate < fields.endDate) {
        errors.readinessDate = "Readiness Date must be on or after the Deployment Date.";
      } else if (readinessDate && fields.startDate && readinessDate < fields.startDate) {
        errors.readinessDate = "Readiness Date must be on or after the Start Date.";
      }
      if (parseWorkingDays(fields.teamEffortWd ?? "") === undefined) {
        errors.teamEffortWd = WORKING_DAYS_ERROR;
      }
      if (parseWorkingDays(fields.timeToMarketWd ?? "") === undefined) {
        errors.timeToMarketWd = WORKING_DAYS_ERROR;
      }
    }
  }
```

  5. In `initialFields`, add these after `releaseTag`:

```ts
    readinessDate: value?.readinessDate ?? "",
    teamEffortWd: value?.teamEffortWd?.toString() ?? "",
    timeToMarketWd: value?.timeToMarketWd?.toString() ?? "",
```

- [ ] **Step 4: Update the component:**

  1. Add `deliveryFields?: boolean;` to `WorkItemFormProps`, and destructure
     `deliveryFields = false,` after `useTeamTracks = false,`.
  2. After the `action` constant, add:

```ts
  const showDeliveryFields = deliveryFields && !useTeamTracks && scheduleMode === "dates";
```

  3. In `handleSubmit`, add `deliveryFields: showDeliveryFields,` to the options
     passed to `validateWorkItemDraft`. In the `onSubmit({...})` object, add this
     after the `...(normalizedTracks ? ...)` line:

```ts
        ...(showDeliveryFields
          ? {
              readinessDate: fields.readinessDate || null,
              teamEffortWd: parseWorkingDays(fields.teamEffortWd ?? "") ?? null,
              timeToMarketWd: parseWorkingDays(fields.timeToMarketWd ?? "") ?? null,
            }
          : {}),
```

  4. In the JSX, the last branch of the schedule ternary is currently a single
     `<div className="form-row">` holding the start and end inputs. Wrap it in a
     fragment and append the delivery inputs after it. Keep the existing row
     unchanged:

```tsx
      ) : (
        <>
          <div className="form-row">
            {/* existing work-item-start and work-item-end fields, unchanged */}
          </div>
          {showDeliveryFields ? (
            <>
              <div className="form-field">
                <label htmlFor="work-item-readiness">Readiness Date</label>
                <input
                  id="work-item-readiness"
                  type="date"
                  value={fields.readinessDate ?? ""}
                  onChange={(event) => setField("readinessDate", event.target.value)}
                  aria-invalid={Boolean(errors.readinessDate)}
                  aria-describedby={errors.readinessDate ? "work-item-readiness-error" : undefined}
                />
                {errors.readinessDate ? (
                  <p className="form-error" id="work-item-readiness-error">{errors.readinessDate}</p>
                ) : null}
              </div>
              <div className="form-row">
                <div className="form-field">
                  <label htmlFor="work-item-team-effort">Team Efforts (WDs)</label>
                  <input
                    id="work-item-team-effort"
                    type="number"
                    min="0"
                    max="9999.9"
                    step="0.1"
                    inputMode="decimal"
                    value={fields.teamEffortWd ?? ""}
                    onChange={(event) => setField("teamEffortWd", event.target.value)}
                    aria-invalid={Boolean(errors.teamEffortWd)}
                    aria-describedby={errors.teamEffortWd ? "work-item-team-effort-error" : undefined}
                  />
                  {errors.teamEffortWd ? (
                    <p className="form-error" id="work-item-team-effort-error">{errors.teamEffortWd}</p>
                  ) : null}
                </div>
                <div className="form-field">
                  <label htmlFor="work-item-time-to-market">Time to market efforts (WDs)</label>
                  <input
                    id="work-item-time-to-market"
                    type="number"
                    min="0"
                    max="9999.9"
                    step="0.1"
                    inputMode="decimal"
                    value={fields.timeToMarketWd ?? ""}
                    onChange={(event) => setField("timeToMarketWd", event.target.value)}
                    aria-invalid={Boolean(errors.timeToMarketWd)}
                    aria-describedby={errors.timeToMarketWd ? "work-item-time-to-market-error" : undefined}
                  />
                  {errors.timeToMarketWd ? (
                    <p className="form-error" id="work-item-time-to-market-error">{errors.timeToMarketWd}</p>
                  ) : null}
                </div>
              </div>
            </>
          ) : null}
        </>
      )}
```

- [ ] **Step 5: Run the tests, type-check, and lint**

Run: `npm run test:unit -- tests/work-item-form.test.tsx && npx tsc --noEmit && npm run lint`
Expected: all pass, including the existing exact-match submit test.

- [ ] **Step 6: Commit**

```bash
git add components/admin/work-item-form.tsx tests/work-item-form.test.tsx
git commit -m "feat(pe-delivery): edit readiness date and efforts in the work item form"
```

---

### Task 5: Dashboard wiring, optimistic saves, and the subtask summary

**Files:**
- Modify: `components/dashboard/dashboard-shell.tsx`
- Modify: `components/dashboard/project-details-modal.tsx`
- Test: `tests/dashboard-shell.test.tsx` and `tests/admin-dashboard.test.tsx`

- [ ] **Step 1: Write the failing shell test.** In `tests/dashboard-shell.test.tsx`,
  next to `"shows Action Owner on PE Development cards"`, add:

```ts
  it("shows PE Development delivery fields on cards and subtasks", async () => {
    const user = userEvent.setup();
    const peDashboard = mapFixtureWorkspace({
      slug: "pe-delivery",
      name: "PE Development",
      description: "Promo engine delivery priorities tracked manually by the team.",
      projects: [],
    });
    const status = {
      statusId: peDashboard.statuses[0].id,
      statusName: peDashboard.statuses[0].name,
      statusColor: peDashboard.statuses[0].color,
    };
    const project = {
      ...dashboard.projects[0],
      ...status,
      title: "Promo engine CR",
      startDate: "2026-03-01",
      endDate: "2026-04-15",
      readinessDate: "2026-04-20",
      teamEffortWd: 8,
      timeToMarketWd: 12.5,
      subtasks: [
        {
          ...dashboard.projects[0],
          ...status,
          id: "pe-subtask",
          title: "Pricing CR",
          startDate: undefined,
          endDate: undefined,
          readinessDate: "2026-04-20",
          teamEffortWd: 1,
          timeToMarketWd: undefined,
          sortOrder: 0,
        },
      ],
    };
    render(
      <DashboardShell
        initialDashboard={{ ...peDashboard, projects: [project] }}
        source="fixture"
      />,
    );

    const card = screen.getByRole("button", { name: "View Promo engine CR details" });
    expect(within(card).getByText("Deployment Date").nextElementSibling).toHaveTextContent("Apr 15, 2026");
    expect(within(card).getByText("Readiness Date").nextElementSibling).toHaveTextContent("Apr 20, 2026");
    expect(within(card).getByText("Team Efforts").nextElementSibling).toHaveTextContent("8 WDs");
    expect(within(card).getByText("Time to market efforts").nextElementSibling).toHaveTextContent("12.5 WDs");
    expect(within(card).queryByText("Target")).not.toBeInTheDocument();

    await user.click(card);
    expect(screen.getByText(`${status.statusName} · Readiness Apr 20, 2026 · Team 1 WD`))
      .toBeInTheDocument();
  });
```

  If `dashboard.projects[0]` has no `subtasks` key, or the card's accessible
  name differs, adjust the fixture to match the surrounding tests. Keep the
  assertions the same.

- [ ] **Step 2: Write the failing admin editor test.** Look at
  `tests/admin-dashboard.test.tsx` to see how it renders an admin shell with
  `source="database"` and the mocked Supabase client. Following that setup, add a
  test for a `pe-delivery` workspace. Opening the edit form for a project should
  show inputs labelled "Start Date", "Deployment Date", "Readiness Date",
  "Team Efforts (WDs)", and "Time to market efforts (WDs)", and no input
  labelled "End date". Saving should send `readiness_date`, `team_effort_wd`,
  and `time_to_market_wd` in the update payload the mocked client receives.

- [ ] **Step 3: Run the tests and confirm they fail**

Run: `npm run test:unit -- tests/dashboard-shell.test.tsx tests/admin-dashboard.test.tsx`
Expected: the new tests fail.

- [ ] **Step 4: Wire up the shell** in `components/dashboard/dashboard-shell.tsx`:

  1. In `optimisticItem`, add these after the `releaseTag` spread:

```ts
    ...(value.readinessDate ? { readinessDate: value.readinessDate } : {}),
    ...(value.teamEffortWd !== null && value.teamEffortWd !== undefined
      ? { teamEffortWd: value.teamEffortWd }
      : {}),
    ...(value.timeToMarketWd !== null && value.timeToMarketWd !== undefined
      ? { timeToMarketWd: value.timeToMarketWd }
      : {}),
```

  2. In `EditorDialog`'s `<WorkItemForm>`, change the date labels and add the flag:

```tsx
        startDateLabel={
          dashboard.slug === "digital" || isPeDeliveryWorkspace(dashboard.slug)
            ? "Start Date"
            : "Start date"
        }
        endDateLabel={
          dashboard.slug === "digital"
            ? "RFT Date"
            : isPeDeliveryWorkspace(dashboard.slug) ? "Deployment Date" : "End date"
        }
        deliveryFields={isPeDeliveryWorkspace(dashboard.slug)}
```

  3. In the `<ProjectCard>` props, change `scheduleMode` to:

```tsx
                      scheduleMode={
                        workspace.slug === "pe-ops" || workspace.slug === "datalake-ops"
                          ? "ops-health"
                          : isPeDeliveryWorkspace(workspace.slug) ? "delivery" : "dates"
                      }
```

  4. On `<ProjectDetailsModal>`, add
     `showDeliveryFields={isPeDeliveryWorkspace(workspace.slug)}`.

- [ ] **Step 5: Update the details modal** in `components/dashboard/project-details-modal.tsx`:
  1. Add `import { deliverySummary } from "@/lib/dashboard/card-format";`.
  2. Add `showDeliveryFields?: boolean;` to `ProjectDetailsModalProps`, and
     destructure `showDeliveryFields = false,`.
  3. Replace `<small>{subtask.statusName} · {subtask.progress}%</small>` with:

```tsx
                    <small>
                      {showDeliveryFields
                        ? [subtask.statusName, deliverySummary(subtask)].filter(Boolean).join(" · ")
                        : `${subtask.statusName} · ${subtask.progress}%`}
                    </small>
```

- [ ] **Step 6: Run the full unit suite, type-check, and lint**

Run: `npm run test:unit && npx tsc --noEmit && npm run lint`
Expected: everything passes apart from the known baseline.

- [ ] **Step 7: Commit**

```bash
git add components/dashboard/dashboard-shell.tsx components/dashboard/project-details-modal.tsx tests/dashboard-shell.test.tsx tests/admin-dashboard.test.tsx
git commit -m "feat(pe-delivery): wire delivery fields into the dashboard"
```

---

### Task 6: Verification

- [ ] **Step 1:** `npm run lint && npx tsc --noEmit && npm run test:unit`. All pass.
- [ ] **Step 2:** `npm run test:database -- --maxWorkers=2`. Only the 2 known
  baseline failures in `tests/security-audit-realtime.test.ts` may fail.
- [ ] **Step 3:** `npm run build`. It must succeed.
- [ ] **Step 4:** Do a manual check in fixture mode. Run the dev server outside
  the sandbox, in the background. Open the PE Development dashboard and confirm
  the cards show Start Date, Deployment Date, Readiness Date, Team Efforts, and
  Time to market efforts, with no Target. Fixture data has no delivery values,
  so the placeholders are expected. Take a screenshot.
