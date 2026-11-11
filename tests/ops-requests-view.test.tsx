import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { OpsRequestsView } from "@/components/ops/ops-requests-view";
import { emptyOpsDataset, type OpsDataset } from "@/lib/ops/types";
import { makeOpsRequest, sampleRequests } from "./fixtures/ops-requests";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({}) }));

const dataset: OpsDataset = {
  ...emptyOpsDataset(),
  requests: [
    ...sampleRequests,
    makeOpsRequest({
      interactionId: "MR-M1",
      source: "manual",
      isMergeRequest: true,
      status: "open",
      requestTitle: "Hand-added merge",
      assignmentTime: "2026-05-21T08:00:00",
      closeDate: null,
      closureCode: "",
    }),
  ],
  upload: {
    uploadedAt: "2026-10-22T07:45:00Z",
    uploadedByEmail: "admin@example.com",
    fileName: "export.csv",
    rowCount: 5,
  },
};

const MERGE_IDS = ["MR-M1", "SD1002"];

function visibleIds() {
  return screen
    .getAllByRole("button", { name: /^View details for / })
    .map((button) => button.textContent);
}

describe("OpsRequestsView", () => {
  it("shows the toolbar, upload summary, and the Merge Requests tab by default", () => {
    render(<OpsRequestsView dataset={dataset} isAdmin={false} toolbar={<span>View toggle</span>} />);

    expect(screen.getByText("View toggle")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 1 })).not.toBeInTheDocument();
    expect(screen.getByText(/Last updated .* by admin@example\.com · 5 requests/)).toBeInTheDocument();

    const tabs = screen.getByRole("group", { name: "Request category" });
    expect(within(tabs).getByRole("button", { name: "Merge Requests" })).toHaveAttribute("aria-pressed", "true");
    expect(within(tabs).getByRole("button", { name: "Issues" })).toHaveAttribute("aria-pressed", "false");

    const overview = screen.getByRole("region", { name: "Ops request overview" });
    expect(within(overview).getByText("Total requests").nextSibling).toHaveTextContent("2");
    expect(within(overview).getByRole("button", { name: /^Open/ })).toHaveTextContent("1");
    expect(within(overview).getByRole("button", { name: /^Pending/ })).toHaveTextContent("0");
    expect(within(overview).getByRole("button", { name: /^In Progress/ })).toHaveTextContent("0");
    expect(within(overview).getByRole("button", { name: /^Closed/ })).toHaveTextContent("1");
    expect(within(overview).getByText("50%")).toBeInTheDocument();
    expect(within(overview).queryByRole("button", { name: /^Merge requests/ })).not.toBeInTheDocument();
    expect(within(overview).queryByRole("button", { name: /^Other requests/ })).not.toBeInTheDocument();

    expect(screen.getByRole("region", { name: "Closure codes" })).toHaveTextContent("Successful");
    expect(screen.queryByRole("region", { name: "By request type" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "By assignee" })).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "By requestor" })).toHaveTextContent("nfawzy");
    expect(screen.getByRole("listitem", { name: "Week of May 4: 1 assigned, 1 closed" })).toBeInTheDocument();

    expect(visibleIds()).toEqual(["MR-M1", "SD1002"]);
    expect(screen.queryByLabelText("Request type")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Upload" })).not.toBeInTheDocument();
  });

  it("marks manual merge items with a Manual badge", () => {
    render(<OpsRequestsView dataset={dataset} isAdmin={false} />);

    const manualRow = screen.getByRole("row", { name: /MR-M1/ });
    expect(within(manualRow).getByText("Manual")).toHaveClass("ops-manual-flag");
    expect(within(screen.getByRole("row", { name: /SD1002/ })).queryByText("Manual")).not.toBeInTheDocument();
  });

  it("switches to the Issues tab and keeps the link in sync", async () => {
    const user = userEvent.setup();
    window.history.replaceState(null, "", "/datalake-ops?view=requests");
    render(<OpsRequestsView dataset={dataset} isAdmin={false} />);

    await user.click(screen.getByRole("button", { name: "Issues" }));
    expect(screen.getByRole("button", { name: "Issues" })).toHaveAttribute("aria-pressed", "true");
    expect(window.location.search).toBe("?view=requests&tab=issues");
    expect(screen.queryByRole("region", { name: "Ops request overview" })).not.toBeInTheDocument();
    const issues = screen.getByRole("region", { name: "Issues" });
    expect(issues).toHaveTextContent("4 of 4 shown");

    await user.click(screen.getByRole("button", { name: "Merge Requests" }));
    expect(window.location.search).toBe("?view=requests");
    expect(screen.getByRole("region", { name: "Ops request overview" })).toBeInTheDocument();
  });

  it("opens straight on the Issues tab from initialTab", () => {
    render(<OpsRequestsView dataset={dataset} isAdmin={false} initialTab="issues" />);

    expect(screen.getByRole("button", { name: "Issues" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("region", { name: "Issues" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Ops request overview" })).not.toBeInTheDocument();
  });

  it("filters the list from the status cards and clears on a second click", async () => {
    const user = userEvent.setup();
    render(<OpsRequestsView dataset={dataset} isAdmin={false} />);
    const closed = screen.getByRole("button", { name: /^Closed/ });

    await user.click(closed);
    expect(closed).toHaveAttribute("aria-pressed", "true");
    expect(visibleIds()).toEqual(["SD1002"]);
    expect(screen.getByLabelText("Status")).toHaveValue("closed");

    await user.click(closed);
    expect(visibleIds()).toEqual(MERGE_IDS);
  });

  it("searches requests", async () => {
    const user = userEvent.setup();
    render(<OpsRequestsView dataset={dataset} isAdmin={false} />);

    await user.type(screen.getByLabelText("Search"), "hand-added");
    expect(visibleIds()).toEqual(["MR-M1"]);

    await user.type(screen.getByLabelText("Search"), "nothing matches");
    expect(screen.getByText("No requests match these filters.")).toBeInTheDocument();
  });

  it("opens request details in a dialog", async () => {
    const user = userEvent.setup();
    render(<OpsRequestsView dataset={dataset} isAdmin={false} />);

    await user.click(screen.getByRole("button", { name: "View details for SD1002" }));
    const dialog = screen.getByRole("dialog", { name: "Merge request 2401" });
    expect(dialog).toHaveTextContent("nfawzy");
    expect(within(dialog).getByText("Request type").nextElementSibling).toHaveTextContent("Merge Request");

    await user.click(within(dialog).getByRole("button", { name: "Close request details" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("shows the empty state and load errors", () => {
    const { rerender } = render(
      <OpsRequestsView
        dataset={emptyOpsDataset()}
        isAdmin={false}
        loadError="Could not load Ops Requests: boom"
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Could not load Ops Requests: boom");
    expect(screen.getByText("Couldn't load the latest data")).toBeInTheDocument();
    expect(screen.queryByText("No data uploaded yet")).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Ops request overview" })).not.toBeInTheDocument();

    rerender(<OpsRequestsView dataset={emptyOpsDataset()} isAdmin={false} />);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getAllByText("No data uploaded yet").length).toBeGreaterThan(0);
    expect(screen.queryByText("Couldn't load the latest data")).not.toBeInTheDocument();
  });
});
