import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IssuesPanel } from "@/components/ops/issues-panel";
import { timestampMs } from "@/lib/ops/analytics";
import type { OpsArea } from "@/lib/ops/types";
import { makeOpsRequest } from "./fixtures/ops-requests";

vi.mock("@/components/ops/use-client-now", () => ({
  useClientNow: () => timestampMs("2026-05-21T08:00:00"),
}));

const areas: OpsArea[] = [
  { id: "a-rep", group: "reporting", name: "Sales reports", ownerName: "Rita", reportsTo: "Carol", sortOrder: 0 },
  { id: "a-ops", group: "operations", name: "Pipelines", ownerName: "Alice", reportsTo: "Dina", sortOrder: 0 },
  { id: "a-dem", group: "demand", name: "Campaigns", ownerName: "Dan", reportsTo: "Carol", sortOrder: 0 },
];

const requests = [
  makeOpsRequest({
    interactionId: "I1",
    status: "open",
    areaId: "a-ops",
    requestTitle: "Pipeline stuck",
    description: "Nightly load never finishes",
    assignmentTime: "2026-05-04T09:00:00",
    closeDate: null,
    closureCode: "",
  }),
  makeOpsRequest({
    interactionId: "I2",
    source: "manual",
    status: "in_progress",
    areaId: "a-ops",
    requestTitle: "Hand-added issue",
    assignmentTime: "2026-05-20T08:00:00",
    closeDate: null,
    closureCode: "",
  }),
  makeOpsRequest({
    interactionId: "I3",
    status: "closed",
    areaId: "a-rep",
    requestTitle: "Dashboard fixed",
    assignmentTime: "2026-05-03T09:00:00",
    closeDate: "2026-05-03T11:00:00",
  }),
  makeOpsRequest({
    interactionId: "I4",
    status: "open",
    areaId: null,
    requestTitle: "Mystery report",
    assignmentTime: "2026-05-19T08:00:00",
    closeDate: null,
    closureCode: "",
  }),
  makeOpsRequest({
    interactionId: "I5",
    status: "open",
    areaId: "a-dem",
    ownerName: "Zed",
    requestTitle: "Campaign data gap",
    assignmentTime: "2026-05-10T08:00:00",
    closeDate: null,
    closureCode: "",
  }),
  makeOpsRequest({ interactionId: "M1", isMergeRequest: true, requestTitle: "Some merge" }),
];

function renderPanel(props: Partial<Parameters<typeof IssuesPanel>[0]> = {}) {
  return render(<IssuesPanel requests={requests} areas={areas} settings={{ escalationDays: 5 }} {...props} />);
}

function visibleIds() {
  return screen
    .getAllByRole("button", { name: /^View details for / })
    .map((button) => button.textContent);
}

describe("IssuesPanel", () => {
  it("shows issue KPIs without merge requests", () => {
    renderPanel();
    const overview = screen.getByRole("region", { name: "Issue overview" });

    expect(within(overview).getByText("Total issues").nextSibling).toHaveTextContent("5");
    expect(within(overview).getByRole("button", { name: /^Open/ })).toHaveTextContent("3");
    expect(within(overview).getByRole("button", { name: /^In Progress/ })).toHaveTextContent("1");
    expect(within(overview).getByRole("button", { name: /^Pending/ })).toHaveTextContent("0");
    expect(within(overview).getByRole("button", { name: /^Closed/ })).toHaveTextContent("1");
    expect(within(overview).getByRole("button", { name: /^Needs escalation/ })).toHaveTextContent("2");
    expect(visibleIds()).toEqual(["I2", "I4", "I5", "I1", "I3"]);
  });

  it("filters by status from the KPI buttons and clears on a second click", async () => {
    const user = userEvent.setup();
    renderPanel();
    const closed = screen.getByRole("button", { name: /^Closed/ });

    await user.click(closed);
    expect(closed).toHaveAttribute("aria-pressed", "true");
    expect(visibleIds()).toEqual(["I3"]);
    expect(screen.getByLabelText("Status")).toHaveValue("closed");

    await user.click(closed);
    expect(closed).toHaveAttribute("aria-pressed", "false");
    expect(visibleIds()).toHaveLength(5);
  });

  it("toggles the Needs escalation filter", async () => {
    const user = userEvent.setup();
    renderPanel();
    const escalation = screen.getByRole("button", { name: /^Needs escalation/ });

    await user.click(escalation);
    expect(escalation).toHaveAttribute("aria-pressed", "true");
    expect(visibleIds()).toEqual(["I5", "I1"]);

    await user.click(escalation);
    expect(escalation).toHaveAttribute("aria-pressed", "false");
    expect(visibleIds()).toHaveLength(5);
  });

  it("renders the ownership board by group with card stats", () => {
    renderPanel();
    const board = screen.getByRole("region", { name: "Ownership" });

    expect(within(board).getByRole("region", { name: "Reporting & Dashboarding SPOCs" })).toBeInTheDocument();
    expect(within(board).getByRole("region", { name: "Data Lake Operations" })).toBeInTheDocument();
    expect(within(board).getByRole("region", { name: "Demand Projects" })).toBeInTheDocument();
    expect(within(board).getByRole("region", { name: "Unrouted" })).toBeInTheDocument();

    const pipelines = within(board).getByRole("button", { name: /Pipelines/ });
    expect(pipelines).toHaveTextContent("Alice");
    expect(pipelines).toHaveTextContent("Reports to Dina");
    expect(pipelines).toHaveTextContent("Open 2");
    expect(pipelines).toHaveTextContent("Closed 0");
    expect(pipelines).toHaveTextContent("Oldest open 17.0d");
    expect(pipelines).toHaveTextContent("Avg resolution —");
    expect(pipelines).toHaveTextContent("1 to escalate");

    const sales = within(board).getByRole("button", { name: /Sales reports/ });
    expect(sales).toHaveTextContent("Open 0");
    expect(sales).toHaveTextContent("Closed 1");
    expect(sales).toHaveTextContent("Avg resolution 2.0h");
    expect(sales).not.toHaveTextContent("to escalate");

    const unrouted = within(board).getByRole("button", { name: /Unrouted/ });
    expect(unrouted).toHaveTextContent("Open 1");
  });

  it("filters the list when a board card is clicked and clears on a second click", async () => {
    const user = userEvent.setup();
    renderPanel();
    const board = screen.getByRole("region", { name: "Ownership" });
    const pipelines = within(board).getByRole("button", { name: /Pipelines/ });

    await user.click(pipelines);
    expect(pipelines).toHaveAttribute("aria-pressed", "true");
    expect(visibleIds()).toEqual(["I2", "I1"]);
    expect(screen.getByLabelText("Area")).toHaveValue("a-ops");

    await user.click(pipelines);
    expect(pipelines).toHaveAttribute("aria-pressed", "false");
    expect(visibleIds()).toHaveLength(5);

    await user.click(within(board).getByRole("button", { name: /Unrouted/ }));
    expect(visibleIds()).toEqual(["I4"]);
  });

  it("filters by area and escalation line selects", async () => {
    const user = userEvent.setup();
    renderPanel();
    const area = screen.getByLabelText("Area");

    const optgroups = within(area).getAllByRole("group");
    expect(optgroups.map((group) => group.getAttribute("label"))).toEqual([
      "Reporting & Dashboarding SPOCs",
      "Data Lake Operations",
      "Demand Projects",
    ]);
    expect(within(area).getByRole("option", { name: "All areas" })).toBeInTheDocument();
    expect(within(area).getByRole("option", { name: "Unrouted" })).toBeInTheDocument();

    await user.selectOptions(area, "a-dem");
    expect(visibleIds()).toEqual(["I5"]);
    await user.selectOptions(area, "all");

    const line = screen.getByLabelText("Escalation line");
    expect(within(line).getAllByRole("option").map((option) => option.textContent)).toEqual([
      "All lines",
      "Carol",
      "Dina",
    ]);
    await user.selectOptions(line, "Carol");
    expect(visibleIds()).toEqual(["I5", "I3"]);
  });

  it("searches issues and shows the empty filter state", async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.type(screen.getByLabelText("Search"), "nightly");
    expect(visibleIds()).toEqual(["I1"]);

    await user.type(screen.getByLabelText("Search"), " nothing matches");
    expect(screen.getByText("No issues match these filters.")).toBeInTheDocument();
  });

  it("shows the empty state when there are no issues", () => {
    renderPanel({ requests: [requests[5]] });
    expect(screen.getByText("No issues yet.")).toBeInTheDocument();
    expect(screen.queryByText("No issues match these filters.")).not.toBeInTheDocument();
  });

  it("marks manual and escalated rows with badges", () => {
    renderPanel();

    const manual = screen.getByRole("row", { name: /I2/ });
    expect(within(manual).getByText("Manual")).toHaveClass("ops-manual-flag");
    expect(within(manual).queryByText(/^Escalate to/)).not.toBeInTheDocument();
    expect(within(screen.getByRole("row", { name: /I1/ })).queryByText("Manual")).not.toBeInTheDocument();

    const escalated = screen.getByRole("row", { name: /I1/ });
    expect(within(escalated).getByText("Escalate to Dina")).toHaveClass("ops-escalate-flag");
    expect(within(screen.getByRole("row", { name: /I5/ })).getByText("Escalate to Carol")).toBeInTheDocument();
    expect(within(screen.getByRole("row", { name: /I3/ })).queryByText(/^Escalate to/)).not.toBeInTheDocument();
  });

  it("shows owner, area and age or resolution in the rows", () => {
    renderPanel();

    const row = screen.getByRole("row", { name: /I5/ });
    expect(within(row).getByText("Campaigns")).toBeInTheDocument();
    expect(within(row).getByText("Zed")).toBeInTheDocument();
    expect(within(row).getByText("11.0d open")).toBeInTheDocument();

    const closed = screen.getByRole("row", { name: /I3/ });
    expect(within(closed).getByText("2.0h")).toBeInTheDocument();

    const unrouted = screen.getByRole("row", { name: /I4/ });
    expect(within(unrouted).getByText("Unrouted")).toBeInTheDocument();
    expect(within(unrouted).getByText("Unassigned")).toBeInTheDocument();
  });

  it("opens issue details with area, owner and reports to", async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.click(screen.getByRole("button", { name: "View details for I1" }));
    const dialog = screen.getByRole("dialog", { name: "Pipeline stuck" });
    expect(within(dialog).getByText("Area").nextElementSibling).toHaveTextContent("Pipelines");
    expect(within(dialog).getByText("Owner").nextElementSibling).toHaveTextContent("Alice");
    expect(within(dialog).getByText("Reports to").nextElementSibling).toHaveTextContent("Dina");
    expect(within(dialog).getByText("Status").nextElementSibling).toHaveTextContent("Open");
    expect(dialog).toHaveTextContent("Nightly load never finishes");

    await user.click(within(dialog).getByRole("button", { name: "Close issue details" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("renders extra row actions when provided", () => {
    renderPanel({ rowActions: (issue) => <button type="button">Edit {issue.request.interactionId}</button> });
    expect(screen.getByRole("button", { name: "Edit I1" })).toBeInTheDocument();
  });
});
