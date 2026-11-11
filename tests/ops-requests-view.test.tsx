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
  uploads: {
    operations: {
      team: "operations",
      uploadedAt: "2026-10-22T07:45:00Z",
      uploadedByEmail: "admin@example.com",
      fileName: "export.csv",
      rowCount: 5,
    },
    data_analytics: null,
  },
};

const teamDataset: OpsDataset = {
  ...dataset,
  requests: [
    ...dataset.requests,
    makeOpsRequest({
      interactionId: "DA-MR1",
      team: "data_analytics",
      isMergeRequest: true,
      requestTitle: "DA merge",
      assignmentTime: "2026-05-14T08:00:00",
      closeDate: null,
      status: "open",
      closureCode: "",
    }),
    makeOpsRequest({
      interactionId: "DA-I1",
      team: "data_analytics",
      requestTitle: "DA issue one",
      status: "open",
      closeDate: null,
      closureCode: "",
    }),
    makeOpsRequest({
      interactionId: "DA-I2",
      team: "data_analytics",
      source: "manual",
      requestTitle: "DA issue two",
      status: "pending",
      closeDate: null,
      closureCode: "",
    }),
  ],
  uploads: {
    ...dataset.uploads,
    data_analytics: {
      team: "data_analytics",
      uploadedAt: "2026-10-23T09:00:00Z",
      uploadedByEmail: "analyst@example.com",
      fileName: "da.csv",
      rowCount: 2,
    },
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
    expect(screen.getByText(/Last updated .* by admin@example\.com · 5 imported/)).toBeInTheDocument();

    const tabs = screen.getByRole("group", { name: "Request category" });
    expect(within(tabs).getByRole("button", { name: "Merge Requests" })).toHaveAttribute("aria-pressed", "true");
    expect(within(tabs).getByRole("button", { name: "Issues" })).toHaveAttribute("aria-pressed", "false");

    const overview = screen.getByRole("region", { name: "Ops request overview" });
    expect(within(overview).getByText("Total merge requests").nextSibling).toHaveTextContent("2");
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
    const overview = screen.getByRole("region", { name: "Ops request overview" });
    expect(within(overview).getByText("Total issues").nextSibling).toHaveTextContent("4");
    expect(screen.getByRole("region", { name: "Requests" })).toHaveTextContent("4 of 4 shown");
    expect(screen.getByRole("region", { name: "Closure codes" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "By requestor" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Merge Requests" }));
    expect(window.location.search).toBe("?view=requests");
    expect(screen.getByRole("region", { name: "Ops request overview" })).toBeInTheDocument();
  });

  it("opens straight on the Issues tab from initialTab", () => {
    render(<OpsRequestsView dataset={dataset} isAdmin={false} initialTab="issues" />);

    expect(screen.getByRole("button", { name: "Issues" })).toHaveAttribute("aria-pressed", "true");
    expect(visibleIds().sort()).toEqual(["SD1001", "SD1003", "SD1004", "SD1005"]);
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
    expect(screen.queryByText("No data uploaded yet for Operations")).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Ops request overview" })).not.toBeInTheDocument();

    rerender(<OpsRequestsView dataset={emptyOpsDataset()} isAdmin={false} />);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByText("No data uploaded yet for Operations")).toBeInTheDocument();
    expect(screen.getByText("No merge requests for Operations yet.")).toBeInTheDocument();
    expect(screen.queryByText("Couldn't load the latest data")).not.toBeInTheDocument();
  });

  describe("team toggle", () => {
    function team(name: string) {
      return within(screen.getByRole("group", { name: "Team" })).getByRole("button", { name });
    }

    it("shows Operations | Data Analytics after the category toggle, Operations by default", () => {
      render(<OpsRequestsView dataset={teamDataset} isAdmin={false} />);

      expect(team("Operations")).toHaveAttribute("aria-pressed", "true");
      expect(team("Data Analytics")).toHaveAttribute("aria-pressed", "false");
      const row = screen.getByRole("group", { name: "Request category" }).parentElement!;
      expect(within(row).getByRole("group", { name: "Team" })).toBeInTheDocument();
    });

    it.each([
      ["merge", "operations", ["MR-M1", "SD1002"]],
      ["issues", "operations", ["SD1001", "SD1003", "SD1004", "SD1005"]],
      ["merge", "data_analytics", ["DA-MR1"]],
      ["issues", "data_analytics", ["DA-I1", "DA-I2"]],
    ] as const)("the %s view of %s shows only its kind and team", (tab, teamValue, ids) => {
      render(<OpsRequestsView dataset={teamDataset} isAdmin={false} initialTab={tab} initialTeam={teamValue} />);

      expect(visibleIds().sort()).toEqual([...ids].sort());
      const overview = screen.getByRole("region", { name: "Ops request overview" });
      expect(within(overview).getByText(/^Total (merge requests|issues)$/).nextSibling).toHaveTextContent(String(ids.length));
    });

    it("switches team, keeps the tab, and syncs the team param (Operations leaves the URL)", async () => {
      const user = userEvent.setup();
      window.history.replaceState(null, "", "/datalake-ops?view=requests&tab=issues");
      render(<OpsRequestsView dataset={teamDataset} isAdmin={false} initialTab="issues" />);

      await user.click(team("Data Analytics"));
      expect(team("Data Analytics")).toHaveAttribute("aria-pressed", "true");
      expect(window.location.search).toBe("?view=requests&tab=issues&team=analytics");
      expect(visibleIds().sort()).toEqual(["DA-I1", "DA-I2"]);
      expect(screen.getByRole("button", { name: "Issues" })).toHaveAttribute("aria-pressed", "true");

      await user.click(screen.getByRole("button", { name: "Merge Requests" }));
      expect(window.location.search).toBe("?view=requests&team=analytics");
      expect(visibleIds()).toEqual(["DA-MR1"]);

      await user.click(team("Operations"));
      expect(window.location.search).toBe("?view=requests");
      expect(visibleIds()).toEqual(["MR-M1", "SD1002"]);
    });

    it("opens straight on Data Analytics from initialTeam", () => {
      render(<OpsRequestsView dataset={teamDataset} isAdmin={false} initialTeam="data_analytics" />);

      expect(team("Data Analytics")).toHaveAttribute("aria-pressed", "true");
      expect(visibleIds()).toEqual(["DA-MR1"]);
    });

    it("shows the selected team's latest upload in the summary", async () => {
      const user = userEvent.setup();
      render(<OpsRequestsView dataset={teamDataset} isAdmin={false} />);

      expect(screen.getByText(/Last updated .* by admin@example\.com · 5 imported/)).toBeInTheDocument();
      await user.click(team("Data Analytics"));
      expect(screen.getByText(/Last updated .* by analyst@example\.com · 2 imported/)).toBeInTheDocument();
      expect(screen.queryByText(/admin@example\.com/)).not.toBeInTheDocument();
    });

    it("names the team in the summary when it has no upload yet", async () => {
      const user = userEvent.setup();
      render(<OpsRequestsView dataset={dataset} isAdmin={false} />);

      await user.click(team("Data Analytics"));
      expect(screen.getByText("No data uploaded yet for Data Analytics")).toBeInTheDocument();
    });

    it("shows a team- and kind-specific empty state", async () => {
      const user = userEvent.setup();
      render(<OpsRequestsView dataset={dataset} isAdmin={false} initialTab="issues" />);

      await user.click(team("Data Analytics"));
      expect(screen.getByText("No issues for Data Analytics yet.")).toBeInTheDocument();
      expect(screen.queryByRole("region", { name: "Ops request overview" })).not.toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "Merge Requests" }));
      expect(screen.getByText("No merge requests for Data Analytics yet.")).toBeInTheDocument();
    });

    it("shows the empty state for a kind the team has none of, though the team has data", () => {
      const onlyMerge: OpsDataset = {
        ...teamDataset,
        requests: teamDataset.requests.filter((request) => request.interactionId !== "DA-I1" && request.interactionId !== "DA-I2"),
      };
      render(<OpsRequestsView dataset={onlyMerge} isAdmin={false} initialTab="issues" initialTeam="data_analytics" />);
      expect(screen.getByText("No issues for Data Analytics yet.")).toBeInTheDocument();
    });
  });

  it("no longer offers ownership or escalation controls", () => {
    render(<OpsRequestsView dataset={teamDataset} isAdmin initialTab="issues" />);

    expect(screen.queryByRole("button", { name: "Manage areas" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Escalation/ })).not.toBeInTheDocument();
    expect(screen.queryByText("Needs escalation")).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: /Ownership/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/Ownership/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Escalation line")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Area")).not.toBeInTheDocument();
  });
});
