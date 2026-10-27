import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import type { Workspace } from "@/data/workspaces";
import { mapFixtureWorkspace } from "@/lib/data/initial-dashboard";
import { WorkItemMutationError } from "@/lib/data/work-item-mutations";

const mutationMocks = vi.hoisted(() => ({
  createWorkItem: vi.fn(),
  updateWorkItem: vi.fn(),
  deleteWorkItem: vi.fn(),
  reorderWorkItems: vi.fn(),
}));
const refetch = vi.hoisted(() => vi.fn());
const realtimeState = vi.hoisted(() => ({ data: undefined as unknown }));

vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({}) }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock("@/lib/data/work-item-mutations", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/data/work-item-mutations")>(),
  ...mutationMocks,
}));
vi.mock("@/hooks/use-workspace-realtime", () => ({
  useWorkspaceRealtime: (initialData: unknown) => ({
    data: realtimeState.data ?? initialData,
    fixture: false,
    connection: "live",
    error: null,
    refetch,
  }),
}));

const fixture: Workspace = {
  slug: "admin",
  name: "Admin workspace",
  description: "Test",
  projects: [{
    id: "11111111-1111-4111-8111-111111111111",
    title: "Existing project",
    description: "Description",
    status: "in-progress",
    owner: "Avery",
    priority: "medium",
    progress: 20,
    comments: [],
  }],
};
const dashboard = mapFixtureWorkspace(fixture);
dashboard.id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
dashboard.statuses[0].id = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
dashboard.projects[0].statusId = dashboard.statuses[0].id;
dashboard.projects[0].updatedAt = "2026-07-15T10:00:00.000Z";
dashboard.projects[0].subtasks = [{
  ...dashboard.projects[0],
  id: "22222222-2222-4222-8222-222222222222",
  title: "Existing subtask",
  updatedAt: "2026-07-15T10:01:00.000Z",
  comments: [],
}];

describe("admin dashboard controls", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    realtimeState.data = dashboard;
    refetch.mockResolvedValue(dashboard);
    mutationMocks.createWorkItem.mockResolvedValue({});
    mutationMocks.updateWorkItem.mockResolvedValue({});
    mutationMocks.deleteWorkItem.mockResolvedValue(undefined);
    mutationMocks.reorderWorkItems.mockResolvedValue(undefined);
  });

  it("keeps public and fixture viewers read-only", () => {
    const { rerender } = render(
      <DashboardShell initialDashboard={dashboard} source="database" isAdmin={false} />,
    );
    expect(screen.queryByRole("button", { name: "New Project" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /delete existing project/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "History" })).not.toBeInTheDocument();

    rerender(<DashboardShell initialDashboard={dashboard} source="fixture" isAdmin />);
    expect(screen.queryByRole("button", { name: "New Project" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "History" })).not.toBeInTheDocument();
  });

  it("renders project and one-level subtask controls for admins", async () => {
    const user = userEvent.setup();
    render(<DashboardShell initialDashboard={dashboard} source="database" isAdmin />);

    expect(screen.getByRole("button", { name: "New Project" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "History" }))
      .toHaveAttribute("href", "/admin/history");
    await user.click(screen.getByRole("button", { name: /view existing project details/i }));
    const dialog = screen.getByRole("dialog", { name: "Existing project" });
    expect(within(dialog).getByRole("button", { name: "Add subtask" })).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Edit Existing subtask" })).toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: /add subtask to existing subtask/i }))
      .not.toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: /Move Existing subtask up/i }))
      .not.toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: /Drag to reorder Existing subtask/i }))
      .toBeInTheDocument();
  });

  async function confirmDelete(user: ReturnType<typeof userEvent.setup>) {
    const confirmDialog = await screen.findByRole("dialog", { name: /Delete /i });
    await user.click(within(confirmDialog).getByRole("button", { name: "Confirm delete" }));
  }

  it("renders existing session controls only for database admins", () => {
    const { rerender } = render(
      <DashboardShell
        initialDashboard={dashboard}
        source="database"
        isAdmin
        adminEmail="admin@example.com"
      />,
    );
    expect(screen.getByText(/signed in as/i)).toHaveTextContent("admin@example.com");
    expect(screen.getByRole("button", { name: "Sign out" })).toBeInTheDocument();

    rerender(
      <DashboardShell
        initialDashboard={dashboard}
        source="database"
        isAdmin={false}
        adminEmail="admin@example.com"
      />,
    );
    expect(screen.queryByRole("button", { name: "Sign out" })).not.toBeInTheDocument();
  });

  it("gives the editor complete modal keyboard and dismissal behavior", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <DashboardShell initialDashboard={dashboard} source="database" isAdmin />,
    );
    const trigger = screen.getByRole("button", { name: "New Project" });

    await user.click(trigger);

    const dialog = screen.getByRole("dialog", { name: "New project" });
    const title = within(dialog).getByLabelText("Title");
    const close = within(dialog).getByRole("button", { name: "Close project form" });
    const submit = within(dialog).getByRole("button", { name: "Create project" });
    expect(title).toHaveFocus();
    expect(container.querySelector(".dashboard")).toHaveAttribute("inert");
    expect(container.querySelector(".dashboard")).toHaveAttribute("aria-hidden", "true");

    close.focus();
    await user.tab({ shift: true });
    expect(submit).toHaveFocus();
    await user.tab();
    expect(close).toHaveFocus();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await vi.waitFor(() => expect(trigger).toHaveFocus());

    await user.click(trigger);
    fireEvent.mouseDown(screen.getByRole("dialog").parentElement!);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await vi.waitFor(() => expect(trigger).toHaveFocus());
  });

  it("creates a project with an optimistic item and authoritative refetch", async () => {
    const user = userEvent.setup();
    let resolveCreate!: () => void;
    mutationMocks.createWorkItem.mockReturnValueOnce(new Promise((resolve) => {
      resolveCreate = () => resolve({});
    }));
    render(<DashboardShell initialDashboard={dashboard} source="database" isAdmin />);

    await user.click(screen.getByRole("button", { name: "New Project" }));
    await user.type(screen.getByLabelText("Title"), "Optimistic project");
    await user.click(screen.getByRole("button", { name: "Create project" }));

    expect(screen.getByText("Optimistic project")).toBeInTheDocument();
    expect(mutationMocks.createWorkItem).toHaveBeenCalledTimes(1);
    resolveCreate();
    await vi.waitFor(() => expect(refetch).toHaveBeenCalled());
  });

  it("edits PE Development delivery fields and submits them", async () => {
    const user = userEvent.setup();
    const peDashboard = {
      ...dashboard,
      slug: "pe-delivery",
      name: "PE Development",
    };
    realtimeState.data = peDashboard;
    render(<DashboardShell initialDashboard={peDashboard} source="database" isAdmin />);

    await user.click(screen.getByRole("button", { name: "Standard Projects" }));
    await user.click(screen.getByRole("button", { name: "Edit Existing project" }));
    const dialog = screen.getByRole("dialog", { name: "Edit project" });
    expect(within(dialog).getByLabelText("Start Date")).toBeInTheDocument();
    expect(within(dialog).getByLabelText("Deployment Date")).toBeInTheDocument();
    expect(within(dialog).getByLabelText("Readiness Date")).toBeInTheDocument();
    expect(within(dialog).getByLabelText("Team Efforts (WDs)")).toBeInTheDocument();
    expect(within(dialog).getByLabelText("Time to market efforts (WDs)")).toBeInTheDocument();
    expect(within(dialog).queryByLabelText("End date")).not.toBeInTheDocument();

    fireEvent.change(within(dialog).getByLabelText("Readiness Date"), {
      target: { value: "2026-05-20" },
    });
    await user.type(within(dialog).getByLabelText("Team Efforts (WDs)"), "8");
    await user.type(within(dialog).getByLabelText("Time to market efforts (WDs)"), "12.5");
    await user.click(within(dialog).getByRole("button", { name: /save project/i }));

    await vi.waitFor(() => expect(mutationMocks.updateWorkItem).toHaveBeenCalledTimes(1));
    expect(mutationMocks.updateWorkItem).toHaveBeenCalledWith(
      expect.anything(),
      dashboard.id,
      dashboard.projects[0].id,
      dashboard.projects[0].updatedAt,
      expect.objectContaining({
        readinessDate: "2026-05-20",
        teamEffortWd: 8,
        timeToMarketWd: 12.5,
      }),
    );
  });

  it("offers a Project type select for PE Development projects but not subtasks", async () => {
    const user = userEvent.setup();
    const peDashboard = {
      ...dashboard,
      slug: "pe-delivery",
      name: "PE Development",
    };
    realtimeState.data = peDashboard;
    render(<DashboardShell initialDashboard={peDashboard} source="database" isAdmin />);

    await user.click(screen.getByRole("button", { name: "New Project" }));
    let projectDialog = screen.getByRole("dialog", { name: "New project" });
    expect(within(projectDialog).getByLabelText("Project type")).toHaveValue("critical");
    await user.click(within(projectDialog).getByRole("button", { name: "Close project form" }));

    await user.click(screen.getByRole("button", { name: "Standard Projects" }));
    await user.click(screen.getByRole("button", { name: "New Project" }));
    projectDialog = screen.getByRole("dialog", { name: "New project" });
    expect(within(projectDialog).getByLabelText("Project type")).toHaveValue("standard");
    await user.click(within(projectDialog).getByRole("button", { name: "Close project form" }));

    await user.click(screen.getByRole("button", { name: /view existing project details/i }));
    const details = screen.getByRole("dialog", { name: "Existing project" });
    await user.click(within(details).getByRole("button", { name: "Add subtask" }));
    const subtaskDialog = screen.getByRole("dialog", { name: /new subtask/i });
    expect(within(subtaskDialog).queryByLabelText("Project type")).not.toBeInTheDocument();
  });

  it("rolls a failed deletion back and offers retry", async () => {
    const user = userEvent.setup();
    mutationMocks.deleteWorkItem.mockRejectedValueOnce(new Error("network unavailable"));
    render(<DashboardShell initialDashboard={dashboard} source="database" isAdmin />);

    await user.click(screen.getByRole("button", { name: "Delete Existing project" }));
    await confirmDelete(user);

    await vi.waitFor(() => expect(screen.getByText("Existing project")).toBeInTheDocument());
    expect(screen.getByRole("alert")).toHaveTextContent("network unavailable");
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });

  it.each([
    ["project", "Delete Existing project", dashboard.projects[0].updatedAt],
    ["subtask", "Delete Existing subtask", dashboard.projects[0].subtasks[0].updatedAt],
  ])("refreshes a stale %s delete without replaying it", async (_, buttonName, updatedAt) => {
    const user = userEvent.setup();
    mutationMocks.deleteWorkItem.mockRejectedValueOnce(
      new WorkItemMutationError(
        "This work item changed by another administrator. Review the latest version.",
        false,
        "WORK_ITEM_CONFLICT",
      ),
    );
    render(<DashboardShell initialDashboard={dashboard} source="database" isAdmin />);

    if (buttonName.includes("subtask")) {
      await user.click(screen.getByRole("button", { name: /view existing project details/i }));
    }
    await user.click(screen.getByRole("button", { name: buttonName }));
    await confirmDelete(user);

    await screen.findByText(/changed by another administrator/i);
    expect(mutationMocks.deleteWorkItem).toHaveBeenCalledWith(
      expect.anything(),
      dashboard.id,
      buttonName.includes("subtask")
        ? dashboard.projects[0].subtasks[0].id
        : dashboard.projects[0].id,
      updatedAt,
    );
    expect(refetch).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: "Retry" })).not.toBeInTheDocument();
  });

  it.each([
    ["project", "Edit Existing project", dashboard.projects[0].updatedAt],
    ["subtask", "Edit Existing subtask", dashboard.projects[0].subtasks[0].updatedAt],
  ])("closes a stale %s editor and requires a fresh edit", async (_, buttonName, updatedAt) => {
    const user = userEvent.setup();
    mutationMocks.updateWorkItem.mockRejectedValueOnce(
      new WorkItemMutationError(
        "This work item changed by another administrator. Review the latest version.",
        false,
        "WORK_ITEM_CONFLICT",
      ),
    );
    render(<DashboardShell initialDashboard={dashboard} source="database" isAdmin />);

    if (buttonName.includes("subtask")) {
      await user.click(screen.getByRole("button", { name: /view existing project details/i }));
    }
    await user.click(screen.getByRole("button", { name: buttonName }));
    await user.clear(screen.getByLabelText("Title"));
    await user.type(screen.getByLabelText("Title"), "Stale intent");
    await user.click(screen.getByRole("button", { name: /save (project|subtask)/i }));

    await screen.findByText(/changed by another administrator/i);
    expect(mutationMocks.updateWorkItem).toHaveBeenCalledWith(
      expect.anything(),
      dashboard.id,
      buttonName.includes("subtask")
        ? dashboard.projects[0].subtasks[0].id
        : dashboard.projects[0].id,
      updatedAt,
      expect.objectContaining({ title: "Stale intent" }),
    );
    expect(screen.queryByLabelText("Title")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Retry" })).not.toBeInTheDocument();
  });

  it("retains newer realtime data during failure recovery and restores project details", async () => {
    const user = userEvent.setup();
    let rejectDelete!: (error: Error) => void;
    const authoritative = {
      ...dashboard,
      projects: [{ ...dashboard.projects[0], title: "Server project" }],
    };
    mutationMocks.deleteWorkItem.mockReturnValueOnce(new Promise((_, reject) => {
      rejectDelete = reject;
    }));
    refetch.mockResolvedValue(authoritative);
    const { rerender } = render(
      <DashboardShell initialDashboard={dashboard} source="database" isAdmin />,
    );
    await user.click(screen.getByRole("button", { name: /view existing project details/i }));

    await user.click(screen.getByRole("button", { name: "Delete Existing project" }));
    await confirmDelete(user);
    realtimeState.data = authoritative;
    rerender(<DashboardShell initialDashboard={dashboard} source="database" isAdmin />);
    rejectDelete(new Error("delete failed"));

    const dialog = await screen.findByRole("dialog", { name: "Server project" });
    expect(dialog).toBeInTheDocument();
    expect(refetch).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Existing project")).not.toBeInTheDocument();
  });

  it("retries only the authoritative refresh after a committed save", async () => {
    const user = userEvent.setup();
    refetch
      .mockRejectedValueOnce(new Error("refresh unavailable"))
      .mockResolvedValueOnce(dashboard);
    render(<DashboardShell initialDashboard={dashboard} source="database" isAdmin />);

    await user.click(screen.getByRole("button", { name: "New Project" }));
    await user.type(screen.getByLabelText("Title"), "Committed project");
    await user.click(screen.getByRole("button", { name: "Create project" }));

    await screen.findByText(/saved, but the dashboard could not refresh/i);
    await user.click(screen.getByRole("button", { name: "Retry" }));

    await vi.waitFor(() => expect(refetch).toHaveBeenCalledTimes(2));
    expect(mutationMocks.createWorkItem).toHaveBeenCalledTimes(1);
  });

  it("refetches before ambiguous create retry and skips an existing client UUID", async () => {
    const user = userEvent.setup();
    mutationMocks.createWorkItem.mockRejectedValueOnce(new Error("request outcome unknown"));
    refetch.mockImplementation(async () => {
      const payload = mutationMocks.createWorkItem.mock.calls[0]?.[1];
      if (!payload?.id) return dashboard;
      const created = {
        ...dashboard.projects[0],
        id: payload.id,
        title: payload.title,
        subtasks: [],
      };
      return { ...dashboard, projects: [...dashboard.projects, created] };
    });
    render(<DashboardShell initialDashboard={dashboard} source="database" isAdmin />);

    await user.click(screen.getByRole("button", { name: "New Project" }));
    await user.type(screen.getByLabelText("Title"), "Possibly committed");
    await user.click(screen.getByRole("button", { name: "Create project" }));
    await screen.findByText("Possibly committed");

    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Retry" }));

    await vi.waitFor(() => expect(refetch).toHaveBeenCalledTimes(2));
    expect(mutationMocks.createWorkItem).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("refetches and recomputes the complete sibling order before lock retry", async () => {
    const user = userEvent.setup();
    const middle = {
      ...dashboard.projects[0],
      id: "33333333-3333-4333-8333-333333333333",
      title: "Middle project",
      subtasks: [],
    };
    const last = {
      ...dashboard.projects[0],
      id: "44444444-4444-4444-8444-444444444444",
      title: "Last project",
      subtasks: [],
    };
    const concurrent = {
      ...dashboard.projects[0],
      id: "55555555-5555-4555-8555-555555555555",
      title: "Concurrent project",
      subtasks: [],
    };
    const orderedDashboard = {
      ...dashboard,
      projects: [dashboard.projects[0], middle, last],
    };
    const changedDashboard = {
      ...dashboard,
      projects: [concurrent, dashboard.projects[0], middle, last],
    };
    realtimeState.data = orderedDashboard;
    mutationMocks.reorderWorkItems
      .mockRejectedValueOnce(new WorkItemMutationError("Try again.", true, "55P03"))
      .mockResolvedValueOnce(undefined);
    refetch.mockResolvedValue(changedDashboard);
    const { container } = render(
      <DashboardShell initialDashboard={orderedDashboard} source="database" isAdmin />,
    );

    const middleHandle = screen.getByRole("button", {
      name: "Drag to reorder Middle project",
    });
    const existingCard = Array.from(container.querySelectorAll(".project-card")).find((card) =>
      card.textContent?.includes("Existing project")
      && !card.textContent?.includes("Middle project"));
    expect(existingCard).toBeTruthy();

    const dataTransfer = {
      effectAllowed: "none",
      dropEffect: "none",
      setData: vi.fn(),
      getData: vi.fn(() => middle.id),
    };
    fireEvent.dragStart(middleHandle, { dataTransfer });
    fireEvent.dragOver(existingCard!, { dataTransfer });
    fireEvent.drop(existingCard!, { dataTransfer });
    fireEvent.dragEnd(middleHandle, { dataTransfer });

    await screen.findByRole("button", { name: "Retry" });
    await user.click(screen.getByRole("button", { name: "Retry" }));

    await vi.waitFor(() => expect(mutationMocks.reorderWorkItems).toHaveBeenCalledTimes(2));
    expect(refetch.mock.invocationCallOrder[1]).toBeLessThan(
      mutationMocks.reorderWorkItems.mock.invocationCallOrder[1],
    );
    expect(mutationMocks.reorderWorkItems.mock.calls[1][3]).toEqual([
      concurrent.id,
      middle.id,
      dashboard.projects[0].id,
      last.id,
    ]);
  });

  it("deletes multiple selected projects after confirmation", async () => {
    const user = userEvent.setup();
    const second = {
      ...dashboard.projects[0],
      id: "33333333-3333-4333-8333-333333333333",
      title: "Second project",
      subtasks: [],
    };
    const multiDashboard = {
      ...dashboard,
      projects: [dashboard.projects[0], second],
    };
    realtimeState.data = multiDashboard;
    refetch.mockImplementation(async () => {
      const deletedIds = new Set(
        mutationMocks.deleteWorkItem.mock.calls.map((call) => call[2] as string),
      );
      return {
        ...multiDashboard,
        projects: multiDashboard.projects.filter((project) => !deletedIds.has(project.id)),
      };
    });
    render(<DashboardShell initialDashboard={multiDashboard} source="database" isAdmin />);

    await user.click(screen.getByRole("checkbox", { name: "Select Existing project" }));
    await user.click(screen.getByRole("checkbox", { name: "Select Second project" }));
    await user.click(screen.getByRole("button", { name: "Delete selected" }));
    await confirmDelete(user);

    await vi.waitFor(() => expect(mutationMocks.deleteWorkItem).toHaveBeenCalledTimes(2));
    expect(mutationMocks.deleteWorkItem.mock.calls.map((call) => call[2])).toEqual([
      dashboard.projects[0].id,
      second.id,
    ]);
  });

  it("opens Manage KPIs for renaming and changing status cards", async () => {
    const user = userEvent.setup();
    render(<DashboardShell initialDashboard={dashboard} source="database" isAdmin />);

    await user.click(screen.getByRole("button", { name: "Manage KPIs" }));
    const dialog = screen.getByRole("dialog", { name: "Manage KPIs" });
    expect(within(dialog).getByRole("button", { name: "New status" })).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Edit In Progress" })).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Delete In Progress" })).toBeInTheDocument();
  });
});
