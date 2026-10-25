import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/view-states";
import type { Workspace } from "@/data/workspaces";
import { mapFixtureWorkspace } from "@/lib/data/initial-dashboard";

const pushMock = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

const workspace: Workspace = {
  slug: "test-workspace",
  name: "Test Workspace",
  description: "A focused delivery view",
  projects: [
    {
      id: "alpha",
      title: "Alpha rollout",
      status: "in-progress",
      owner: "Avery Stone",
      ownerRole: "Delivery lead",
      priority: "high",
      progress: 72,
      startDate: "2026-06-01",
      endDate: "2026-08-15",
      description: "<strong>Literal, safely rendered text</strong>",
      comments: [{ author: "Avery", text: "Ready for the next checkpoint." }],
    },
    {
      id: "beta",
      title: "Beta migration",
      status: "completed",
      owner: "Morgan Lee",
      priority: "medium",
      progress: 100,
      startDate: "2026-04-10",
      endDate: "2026-06-20",
      description: "Migration is complete.",
      comments: [],
    },
  ],
};
const dashboard = mapFixtureWorkspace(workspace);

describe("DashboardShell", () => {
  it("filters project cards by status", async () => {
    const user = userEvent.setup();
    render(<DashboardShell initialDashboard={dashboard} source="fixture" />);

    expect(screen.getByText("Alpha rollout")).toBeInTheDocument();
    expect(screen.getByText("Beta migration")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Completed" }));

    expect(screen.queryByText("Alpha rollout")).not.toBeInTheDocument();
    expect(screen.getByText("Beta migration")).toBeInTheDocument();
  });

  it("opens an accessible project dialog and closes it with x", async () => {
    const user = userEvent.setup();
    render(<DashboardShell initialDashboard={dashboard} source="fixture" />);

    const trigger = screen.getByRole("button", { name: /view alpha rollout details/i });
    await user.click(trigger);

    const dialog = screen.getByRole("dialog", { name: "Alpha rollout" });
    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getByText("<strong>Literal, safely rendered text</strong>")).toBeInTheDocument();
    expect(within(dialog).queryByText("Literal, safely rendered text")).not.toBeInTheDocument();

    const close = within(dialog).getByRole("button", { name: "Close project details" });
    expect(close).toHaveTextContent(/^x$/);
    await user.click(close);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("traps focus inside the dialog and makes the dashboard inert", async () => {
    const user = userEvent.setup();
    const { container } = render(<DashboardShell initialDashboard={dashboard} source="fixture" />);
    await user.click(screen.getByRole("button", { name: /view alpha rollout details/i }));

    const close = screen.getByRole("button", { name: "Close project details" });
    const dashboardElement = container.querySelector(".dashboard");
    expect(close).toHaveFocus();
    expect(dashboardElement).toHaveAttribute("inert");
    expect(dashboardElement).toHaveAttribute("aria-hidden", "true");

    await user.tab();
    expect(close).toHaveFocus();
    await user.tab({ shift: true });
    expect(close).toHaveFocus();
  });

  it("closes the project dialog with Escape", async () => {
    const user = userEvent.setup();
    render(<DashboardShell initialDashboard={dashboard} source="fixture" />);
    await user.click(screen.getByRole("button", { name: /view alpha rollout details/i }));

    await user.keyboard("{Escape}");

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("renders loading and error states through the shell contract", () => {
    const { rerender } = render(
      <DashboardShell initialDashboard={dashboard} source="fixture" viewState="loading" />,
    );
    expect(screen.getByText("Loading projects").closest('[role="status"]')).toBeInTheDocument();
    expect(screen.queryByText("Alpha rollout")).not.toBeInTheDocument();

    rerender(<DashboardShell initialDashboard={dashboard} source="fixture" viewState="error" />);
    expect(screen.getByRole("alert")).toHaveTextContent("Unable to load projects");
    expect(screen.queryByText("Alpha rollout")).not.toBeInTheDocument();
  });

  it("navigates between workspaces without a document reload", async () => {
    const user = userEvent.setup();
    render(<DashboardShell initialDashboard={dashboard} source="fixture" />);

    await user.selectOptions(screen.getByRole("combobox", { name: "Workspace" }), "hot-topics");

    expect(pushMock).toHaveBeenCalledWith("/hot-topics");
  });

  it("labels the offline build fallback and derives custom status filters", () => {
    const customDashboard = {
      ...dashboard,
      statuses: [{ ...dashboard.statuses[0], id: "custom-review", name: "Awaiting Review" }],
      projects: [{
        ...dashboard.projects[0],
        statusId: "custom-review",
        statusName: "Awaiting Review",
      }],
      kpis: { total: 1, active: 1, needsAttention: 0, completed: 0, averageProgress: 72 },
    };
    render(<DashboardShell initialDashboard={customDashboard} source="fixture" />);

    expect(screen.getByRole("status")).toHaveTextContent("Local/test fixture");
    const overview = screen.getByRole("region", { name: "Workspace status overview" });
    expect(within(overview).getByRole("button", { name: /Awaiting Review/i })).toHaveTextContent("1");
    expect(screen.queryByText("Total projects")).not.toBeInTheDocument();
    expect(screen.queryByText("Needs attention")).not.toBeInTheDocument();
  });

  it("shows clickable status metrics for pe-development and hides the Jira banner", async () => {
    const user = userEvent.setup();
    const peDashboard = {
      ...dashboard,
      slug: "pe-development",
      name: "PE Development",
      jiraLinked: true,
      lastJiraSyncAt: "2026-08-10T09:22:25.000Z",
      statuses: [
        { ...dashboard.statuses[0], id: "live", name: "live", color: "#23b123" },
        { ...dashboard.statuses[1], id: "pending", name: "pending", color: "#f59e0b" },
      ],
      projects: [
        {
          ...dashboard.projects[0],
          statusId: "live",
          statusName: "live",
          statusColor: "#23b123",
        },
        {
          ...dashboard.projects[1],
          statusId: "pending",
          statusName: "pending",
          statusColor: "#f59e0b",
        },
      ],
    };
    render(<DashboardShell initialDashboard={peDashboard} source="fixture" />);

    expect(screen.queryByText(/This workspace mirrors Jira/i)).not.toBeInTheDocument();
    expect(screen.queryByText("Total projects")).not.toBeInTheDocument();

    const overview = screen.getByRole("region", { name: "Workspace status overview" });
    expect(within(overview).getByRole("button", { name: /All Projects/i })).toHaveTextContent("2");

    const liveMetric = within(overview).getByRole("button", { name: /^live/i });
    expect(liveMetric).toHaveTextContent("1");
    await user.click(liveMetric);

    expect(screen.getByText("Alpha rollout")).toBeInTheDocument();
    expect(screen.queryByText("Beta migration")).not.toBeInTheDocument();
    expect(liveMetric).toHaveAttribute("aria-pressed", "true");
  });

  it("shows a Live / Live with CRs dropdown for pe-development live filter", async () => {
    const user = userEvent.setup();
    const peDashboard = {
      ...dashboard,
      slug: "pe-development",
      name: "PE Development",
      jiraLinked: true,
      statuses: [
        { ...dashboard.statuses[0], id: "live", name: "live", color: "#23b123" },
        { ...dashboard.statuses[1], id: "pending", name: "pending", color: "#f59e0b" },
      ],
      projects: [
        {
          ...dashboard.projects[0],
          id: "pure-live",
          title: "Pure live parent",
          statusId: "live",
          statusName: "live",
          statusColor: "#23b123",
          subtasks: [{
            ...dashboard.projects[0],
            id: "pure-live-child",
            title: "Live child",
            statusId: "live",
            statusName: "live",
            statusColor: "#23b123",
            subtasks: undefined,
          }],
        },
        {
          ...dashboard.projects[1],
          id: "live-with-cr",
          title: "Live parent with CR",
          statusId: "live",
          statusName: "live",
          statusColor: "#23b123",
          subtasks: [{
            ...dashboard.projects[1],
            id: "cr-child",
            title: "CR child",
            statusId: "pending",
            statusName: "pending",
            statusColor: "#f59e0b",
            subtasks: undefined,
          }],
        },
      ],
    };

    render(<DashboardShell initialDashboard={peDashboard} source="fixture" />);

    expect(screen.queryByLabelText("Live view")).not.toBeInTheDocument();

    const overview = screen.getByRole("region", { name: "Workspace status overview" });
    await user.click(within(overview).getByRole("button", { name: /^live/i }));

    const liveView = screen.getByLabelText("Live view");
    expect(liveView).toBeInTheDocument();
    expect(screen.getByText("Pure live parent")).toBeInTheDocument();
    expect(screen.queryByText("Live parent with CR")).not.toBeInTheDocument();

    await user.selectOptions(liveView, "live-with-crs");
    expect(screen.queryByText("Pure live parent")).not.toBeInTheDocument();
    expect(screen.getByText("Live parent with CR")).toBeInTheDocument();
  });

  it("renders arbitrary status colors only on decorative indicators", () => {
    render(<DashboardShell initialDashboard={dashboard} source="fixture" />);
    const badge = screen.getAllByText("In Progress")
      .map((element) => element.closest(".status-badge"))
      .find((element) => element !== null);
    const dot = badge?.querySelector("span");

    expect(badge).not.toHaveStyle({ color: dashboard.projects[0].statusColor });
    expect(dot).toHaveStyle({ backgroundColor: dashboard.projects[0].statusColor });
    expect(dot).toHaveAttribute("aria-hidden", "true");
  });

  it("shows Hot Topics descriptions only when they contain text", () => {
    const hotTopicsDashboard = mapFixtureWorkspace({
      slug: "hot-topics",
      name: "Hot Topics Daily Follow-up",
      description: "Daily follow-up",
      projects: [
        {
          id: "with-text",
          title: "Has notes",
          status: "in-progress",
          owner: "Avery",
          priority: "high",
          progress: 10,
          description: "Escalated to vendor",
          comments: [],
        },
        {
          id: "blank",
          title: "No notes",
          status: "in-progress",
          owner: "Morgan",
          priority: "low",
          progress: 0,
          description: "   ",
          comments: [],
        },
      ],
    });
    render(<DashboardShell initialDashboard={hotTopicsDashboard} source="fixture" />);

    expect(screen.getByRole("region", { name: "Has notes description" }))
      .toHaveTextContent("Escalated to vendor");
    expect(screen.queryByRole("region", { name: "No notes description" }))
      .not.toBeInTheDocument();
  });

  it("labels the all filter as All Tasks and shows Deployments for Data Lake Ops", () => {
    const datalakeDashboard = mapFixtureWorkspace({
      slug: "datalake-ops",
      name: "Data Lake Operations",
      description: "Data lake operations priorities tracked manually by the team.",
      projects: [],
    });
    render(<DashboardShell initialDashboard={datalakeDashboard} source="fixture" />);

    const overview = screen.getByRole("region", { name: "Workspace status overview" });
    expect(within(overview).getByRole("button", { name: /All Tasks/i })).toBeInTheDocument();
    expect(within(overview).queryByRole("button", { name: /All Projects/i })).not.toBeInTheDocument();
    expect(within(overview).getByRole("button", { name: /Deployments/i })).toBeInTheDocument();

    const filters = screen.getByLabelText("Filter projects by status");
    expect(within(filters).getByRole("button", { name: "All Tasks" })).toBeInTheDocument();
    expect(within(filters).getByRole("button", { name: "Deployments" })).toBeInTheDocument();
  });

  it("shows Data Lake team-track dates and KPI statuses", () => {
    const dataLakeDashboard = mapFixtureWorkspace({
      slug: "data-lake",
      name: "Data Lake and AI",
      description: "Data Lake and AI delivery priorities tracked manually by the team.",
      projects: [],
    });
    const project = {
      ...dashboard.projects[0],
      statusId: dataLakeDashboard.statuses[0].id,
      statusName: dataLakeDashboard.statuses[0].name,
      statusColor: dataLakeDashboard.statuses[0].color,
      owner: "Sam Digital",
      releaseTag: "R1",
      description: "Cross-team rollout",
      teamTracks: [
        {
          id: "t1",
          teamName: "Data Lake",
          statusId: dataLakeDashboard.statuses[0].id,
          statusName: dataLakeDashboard.statuses[0].name,
          statusColor: dataLakeDashboard.statuses[0].color,
          startDate: "2026-03-01",
          endDate: "2026-04-15",
          sortOrder: 0,
        },
        {
          id: "t2",
          teamName: "Analytics",
          statusId: dataLakeDashboard.statuses[1].id,
          statusName: dataLakeDashboard.statuses[1].name,
          statusColor: dataLakeDashboard.statuses[1].color,
          startDate: "2026-03-10",
          endDate: "2026-05-01",
          sortOrder: 1,
        },
      ],
      subtasks: [],
    };
    render(
      <DashboardShell
        initialDashboard={{ ...dataLakeDashboard, projects: [project] }}
        source="fixture"
      />,
    );

    const overview = screen.getByRole("region", { name: "Workspace status overview" });
    expect(within(overview).getByRole("button", { name: /Planning/i })).toHaveTextContent("1");
    expect(within(overview).getByRole("button", { name: /In Progress/i })).toHaveTextContent("1");
    expect(within(overview).getByRole("button", { name: /Pending/i })).toBeInTheDocument();
    expect(within(overview).getByRole("button", { name: /On Hold/i })).toBeInTheDocument();
    expect(within(overview).getByRole("button", { name: /Testing/i })).toBeInTheDocument();
    expect(within(overview).getByRole("button", { name: /\bDone\b/i })).toBeInTheDocument();
    expect(within(overview).queryByRole("button", { name: /Cancelled/i })).not.toBeInTheDocument();
    expect(screen.getByText("Data Lake Start Date")).toBeInTheDocument();
    expect(screen.getByText("Analytics End Date")).toBeInTheDocument();
    expect(screen.getByText("Action Owner")).toBeInTheDocument();
    expect(screen.getByLabelText("Release R1")).toHaveTextContent("R1");
    expect(screen.getByText("Description")).toBeInTheDocument();
    expect(screen.getByText("Cross-team rollout")).toBeInTheDocument();
    expect(screen.queryByText("Comments")).not.toBeInTheDocument();
  });

  it("shows Reports and Insights with the same team-track fields as Data Lake", () => {
    const reportsDashboard = mapFixtureWorkspace({
      slug: "reports-and-insights",
      name: "Reports and Insights",
      description: "Reports and Insights delivery priorities tracked manually by the team.",
      projects: [],
    });
    const project = {
      ...dashboard.projects[0],
      statusId: reportsDashboard.statuses[0].id,
      statusName: reportsDashboard.statuses[0].name,
      statusColor: reportsDashboard.statuses[0].color,
      owner: "Sam Reports",
      releaseTag: "R2",
      description: "Insight pack",
      teamTracks: [
        {
          id: "t1",
          teamName: "Insights",
          statusId: reportsDashboard.statuses[1].id,
          statusName: reportsDashboard.statuses[1].name,
          statusColor: reportsDashboard.statuses[1].color,
          startDate: "2026-04-01",
          endDate: "2026-05-01",
          sortOrder: 0,
        },
      ],
      subtasks: [],
    };
    render(
      <DashboardShell
        initialDashboard={{ ...reportsDashboard, projects: [project] }}
        source="fixture"
      />,
    );

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Reports and Insights");
    expect(screen.getByText("Insights Start Date")).toBeInTheDocument();
    expect(screen.getByText("Action Owner")).toBeInTheDocument();
    expect(screen.getByLabelText("Release R2")).toHaveTextContent("R2");
    expect(screen.getByText("Description")).toBeInTheDocument();
    expect(screen.getByText("Insight pack")).toBeInTheDocument();
  });

  it("labels PE Development all filter as Projects / CRS and shows effort notes", () => {
    const peDashboard = mapFixtureWorkspace({
      slug: "pe-delivery",
      name: "PE Development",
      description: "Promo engine delivery priorities tracked manually by the team.",
      projects: [],
    });
    render(
      <DashboardShell
        initialDashboard={{
          ...peDashboard,
          projects: [
            {
              ...dashboard.projects[0],
              statusId: peDashboard.statuses[0].id,
              statusName: peDashboard.statuses[0].name,
              statusColor: peDashboard.statuses[0].color,
              subtasks: [],
            },
          ],
        }}
        source="fixture"
      />,
    );

    const overview = screen.getByRole("region", { name: "Workspace status overview" });
    expect(within(overview).getByRole("button", { name: /Projects \/ CRS/i })).toBeInTheDocument();
    expect(within(overview).queryByRole("button", { name: /All Projects/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Projects / CRS" })).toBeInTheDocument();

    const notes = screen.getByRole("complementary", { name: "PE Development effort guide" });
    expect(within(notes).getByText("Complexity")).toBeInTheDocument();
    expect(within(notes).getByText("Effort")).toBeInTheDocument();
    expect(within(notes).getByText("Low")).toBeInTheDocument();
    expect(within(notes).getByText("1–3 WDs")).toBeInTheDocument();
    expect(within(notes).getByText("Medium")).toBeInTheDocument();
    expect(within(notes).getByText("4–10 WDs")).toBeInTheDocument();
    expect(within(notes).getByText("High")).toBeInTheDocument();
    expect(within(notes).getByText("10–20 WDs")).toBeInTheDocument();
    expect(within(notes).getByText(/Average efforts in the last 3 months/i)).toBeInTheDocument();
    expect(within(notes).getByText("2 WDs")).toBeInTheDocument();
    expect(within(notes).getByText("10 WDs")).toBeInTheDocument();
  });

  it("shows Action Owner on PE Development cards", () => {
    const peDashboard = mapFixtureWorkspace({
      slug: "pe-delivery",
      name: "PE Development",
      description: "Promo engine delivery priorities tracked manually by the team.",
      projects: [],
    });
    const project = {
      ...dashboard.projects[0],
      statusId: peDashboard.statuses[0].id,
      statusName: peDashboard.statuses[0].name,
      statusColor: peDashboard.statuses[0].color,
      owner: "Alex Owner",
      ownerRole: undefined,
      subtasks: [],
    };
    render(
      <DashboardShell
        initialDashboard={{ ...peDashboard, projects: [project] }}
        source="fixture"
      />,
    );

    expect(screen.getByText("Alex Owner")).toBeInTheDocument();
    expect(screen.getByText("Action Owner")).toBeInTheDocument();
    expect(screen.queryByText("Project owner")).not.toBeInTheDocument();
  });

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

  it("shows Digital KPI statuses and Action Owner card layout", () => {
    const digitalDashboard = {
      ...mapFixtureWorkspace({
        slug: "digital",
        name: "Digital",
        description: "Digital delivery priorities tracked manually by the team.",
        projects: [],
      }),
      projects: [
        {
          ...dashboard.projects[0],
          statusId: "fixture-in-progress",
          statusName: "In Progress",
          statusColor: "#237b4b",
          owner: "Sam Digital",
          releaseTag: "R12",
          startDate: "2026-03-01",
          endDate: "2026-04-15",
          description: "Waiting on creative assets",
          subtasks: [],
        },
      ],
    };
    // Align status ids with fixture naming from mapFixtureWorkspace.
    digitalDashboard.statuses = digitalDashboard.statuses.map((status) => status);
    digitalDashboard.projects[0].statusId = digitalDashboard.statuses[0].id;
    digitalDashboard.projects[0].statusName = digitalDashboard.statuses[0].name;

    render(<DashboardShell initialDashboard={digitalDashboard} source="fixture" />);

    const overview = screen.getByRole("region", { name: "Workspace status overview" });
    expect(within(overview).getByRole("button", { name: /In Progress/i })).toBeInTheDocument();
    expect(within(overview).getByRole("button", { name: /Pending/i })).toBeInTheDocument();
    expect(within(overview).getByRole("button", { name: /Cancelled/i })).toBeInTheDocument();
    expect(within(overview).getByRole("button", { name: /Live/i })).toBeInTheDocument();

    expect(screen.getByText("Sam Digital")).toBeInTheDocument();
    expect(screen.getByText("Action Owner")).toBeInTheDocument();
    expect(screen.getByText("Start Date")).toBeInTheDocument();
    expect(screen.getByText("RFT Date")).toBeInTheDocument();
    expect(screen.getByLabelText("Release R12")).toHaveTextContent("R12");
    expect(screen.getByText("Comments")).toBeInTheDocument();
    expect(screen.getByText("Waiting on creative assets")).toBeInTheDocument();
    expect(screen.queryByText("Last Week Status")).not.toBeInTheDocument();
  });
});

describe("view states", () => {
  it("renders focused loading, empty, and error messages", () => {
    const { rerender } = render(<LoadingState />);
    expect(screen.getByRole("status")).toHaveTextContent("Loading projects");

    rerender(<EmptyState />);
    expect(screen.getByText("No projects found")).toBeInTheDocument();

    rerender(<ErrorState />);
    expect(screen.getByRole("alert")).toHaveTextContent("Unable to load projects");
  });
});
