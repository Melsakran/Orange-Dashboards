import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { OpsRequestsPage } from "@/components/ops/ops-requests-page";
import type { OpsDataset } from "@/lib/ops/types";
import { sampleRequests } from "./fixtures/ops-requests";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({}) }));

const dataset: OpsDataset = {
  requests: sampleRequests,
  upload: {
    uploadedAt: "2026-10-22T07:45:00Z",
    uploadedByEmail: "admin@example.com",
    fileName: "export.csv",
    rowCount: 5,
  },
};

function visibleIds() {
  return screen
    .getAllByRole("button", { name: /^View details for / })
    .map((button) => button.textContent);
}

describe("OpsRequestsPage", () => {
  it("shows the header, KPIs, breakdowns, timeline, and request list", () => {
    render(<OpsRequestsPage dataset={dataset} isAdmin={false} />);

    expect(screen.getByRole("heading", { level: 1, name: "Ops Requests" })).toBeInTheDocument();
    expect(screen.getByText(/Last updated .* by admin@example\.com · 5 requests/)).toBeInTheDocument();

    const overview = screen.getByRole("region", { name: "Ops request overview" });
    expect(within(overview).getByText("Total requests").nextSibling).toHaveTextContent("5");
    expect(within(overview).getByRole("button", { name: /^Open/ })).toHaveTextContent("1");
    expect(within(overview).getByRole("button", { name: /^Pending/ })).toHaveTextContent("1");
    expect(within(overview).getByRole("button", { name: /^Closed/ })).toHaveTextContent("3");
    expect(within(overview).getByText("60%")).toBeInTheDocument();

    expect(screen.getByRole("region", { name: "Closure codes" })).toHaveTextContent("Successful");
    const assignees = screen.getByRole("region", { name: "By assignee" });
    expect(within(assignees).getByRole("row", { name: /HElGhandour/ })).toHaveTextContent("2");
    expect(screen.getByRole("region", { name: "By requestor" })).toHaveTextContent("NFawzy");
    expect(screen.getByRole("listitem", { name: "Week of May 4: 2 assigned, 2 closed" })).toBeInTheDocument();

    expect(visibleIds()).toEqual(["SD1005", "SD1004", "SD1003", "SD1002", "SD1001"]);
    expect(screen.queryByRole("button", { name: "Upload" })).not.toBeInTheDocument();
  });

  it("filters the list from the status cards and clears on a second click", async () => {
    const user = userEvent.setup();
    render(<OpsRequestsPage dataset={dataset} isAdmin={false} />);
    const closed = screen.getByRole("button", { name: /^Closed/ });

    await user.click(closed);
    expect(closed).toHaveAttribute("aria-pressed", "true");
    expect(visibleIds()).toEqual(["SD1003", "SD1002", "SD1001"]);
    expect(screen.getByLabelText("Status")).toHaveValue("closed");

    await user.click(closed);
    expect(visibleIds()).toHaveLength(5);
  });

  it("searches and filters by assignee", async () => {
    const user = userEvent.setup();
    render(<OpsRequestsPage dataset={dataset} isAdmin={false} />);

    await user.type(screen.getByLabelText("Search"), "quota");
    expect(visibleIds()).toEqual(["SD1004"]);

    await user.clear(screen.getByLabelText("Search"));
    await user.selectOptions(screen.getByLabelText("Assignee"), "helghandour");
    expect(visibleIds()).toEqual(["SD1002", "SD1001"]);

    await user.type(screen.getByLabelText("Search"), "nothing matches");
    expect(screen.getByText("No requests match these filters.")).toBeInTheDocument();
  });

  it("opens request details in a dialog", async () => {
    const user = userEvent.setup();
    render(<OpsRequestsPage dataset={dataset} isAdmin={false} />);

    await user.click(screen.getByRole("button", { name: "View details for SD1004" }));
    const dialog = screen.getByRole("dialog", { name: "Quota offer" });
    expect(dialog).toHaveTextContent("Double quota for the attached customer list");
    expect(dialog).toHaveTextContent("rshalim");

    await user.click(within(dialog).getByRole("button", { name: "Close request details" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("shows the empty state and load errors", () => {
    const { rerender } = render(
      <OpsRequestsPage
        dataset={{ requests: [], upload: null }}
        isAdmin={false}
        loadError="Could not load Ops Requests: boom"
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Could not load Ops Requests: boom");
    expect(screen.getByText("Couldn't load the latest data")).toBeInTheDocument();
    expect(screen.queryByText("No data uploaded yet")).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Ops request overview" })).not.toBeInTheDocument();

    rerender(<OpsRequestsPage dataset={{ requests: [], upload: null }} isAdmin={false} />);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getAllByText("No data uploaded yet").length).toBeGreaterThan(0);
    expect(screen.queryByText("Couldn't load the latest data")).not.toBeInTheDocument();
  });
});
