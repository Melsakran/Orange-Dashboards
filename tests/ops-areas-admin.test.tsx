import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { OpsRequestsView } from "@/components/ops/ops-requests-view";
import { timestampMs } from "@/lib/ops/analytics";
import { emptyOpsDataset, type OpsArea, type OpsDataset } from "@/lib/ops/types";

const refresh = vi.hoisted(() => vi.fn());
const saveOpsArea = vi.hoisted(() => vi.fn());
const deleteOpsArea = vi.hoisted(() => vi.fn());
const saveOpsSettings = vi.hoisted(() => vi.fn());
const fakeClient = vi.hoisted(() => ({ kind: "browser-client" }));

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("@/lib/supabase/client", () => ({ createClient: () => fakeClient }));
vi.mock("@/lib/ops/mutations", () => ({
  saveOpsArea,
  deleteOpsArea,
  saveOpsSettings,
  saveOpsManualItem: vi.fn(),
  deleteOpsManualItem: vi.fn(),
  routeOpsRequest: vi.fn(),
}));
vi.mock("@/components/ops/use-client-now", () => ({
  useClientNow: () => timestampMs("2026-05-21T08:00:00"),
}));

const areas: OpsArea[] = [
  { id: "a-rep", group: "reporting", name: "Sales reports", ownerName: "Rita", reportsTo: "Carol", sortOrder: 0 },
  { id: "a-ops1", group: "operations", name: "Pipelines", ownerName: "Alice", reportsTo: "Dina", sortOrder: 0 },
  { id: "a-ops2", group: "operations", name: "Warehouse", ownerName: "Omar", reportsTo: "Dina", sortOrder: 4 },
];

const dataset: OpsDataset = {
  ...emptyOpsDataset(),
  areas,
  settings: { escalationDays: 12 },
};

function renderView(isAdmin = true) {
  return render(<OpsRequestsView dataset={dataset} isAdmin={isAdmin} />);
}

async function openIssuesTab(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Issues" }));
}

async function openManage(user: ReturnType<typeof userEvent.setup>) {
  renderView();
  await openIssuesTab(user);
  await user.click(screen.getByRole("button", { name: "Manage areas" }));
  return screen.findByRole("dialog", { name: "Manage areas" });
}

function rowOf(dialog: HTMLElement, name: string) {
  return within(dialog).getByRole("group", { name: `Area ${name}` });
}

function setIn(scope: HTMLElement, label: string, value: string) {
  fireEvent.change(within(scope).getByLabelText(label), { target: { value } });
}

beforeEach(() => {
  vi.clearAllMocks();
  saveOpsArea.mockResolvedValue("area-id");
  deleteOpsArea.mockResolvedValue(undefined);
  saveOpsSettings.mockResolvedValue(undefined);
});

describe("admin-only controls", () => {
  it("shows Manage areas and Escalation only to admins on the Issues tab", async () => {
    const user = userEvent.setup();
    const { unmount } = renderView(false);
    await openIssuesTab(user);
    expect(screen.queryByRole("button", { name: "Manage areas" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Escalation:/ })).not.toBeInTheDocument();
    unmount();

    renderView(true);
    expect(screen.queryByRole("button", { name: "Manage areas" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Escalation:/ })).not.toBeInTheDocument();
    await openIssuesTab(user);
    expect(screen.getByRole("button", { name: "Manage areas" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Escalation: 12 days" })).toBeInTheDocument();
  });
});

describe("Manage areas", () => {
  it("lists areas by group with editable fields and an Add area row per group", async () => {
    const user = userEvent.setup();
    const dialog = await openManage(user);

    const headings = within(dialog).getAllByRole("heading", { level: 3 }).map((heading) => heading.textContent);
    expect(headings).toEqual(["Reporting & Dashboarding SPOCs", "Data Lake Operations", "Demand Projects"]);

    const row = rowOf(dialog, "Pipelines");
    expect(within(row).getByLabelText("Name")).toHaveValue("Pipelines");
    expect(within(row).getByLabelText("Owner")).toHaveValue("Alice");
    expect(within(row).getByLabelText("Reports to")).toHaveValue("Dina");
    expect(within(row).getByRole("button", { name: "Save" })).toBeInTheDocument();
    expect(within(row).getByRole("button", { name: "Delete" })).toBeInTheDocument();

    for (const label of ["Reporting & Dashboarding SPOCs", "Data Lake Operations", "Demand Projects"]) {
      const add = within(dialog).getByRole("group", { name: `Add area to ${label}` });
      expect(within(add).getByRole("button", { name: "Add" })).toBeInTheDocument();
    }
  });

  it("saves an edited row with its group and sort order, then refreshes and stays open", async () => {
    const user = userEvent.setup();
    const dialog = await openManage(user);
    const row = rowOf(dialog, "Warehouse");

    setIn(row, "Name", "  Warehouse ops ");
    setIn(row, "Owner", "Maya");
    setIn(row, "Reports to", "Zed");
    await user.click(within(row).getByRole("button", { name: "Save" }));

    await vi.waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(saveOpsArea).toHaveBeenCalledWith(fakeClient, {
      id: "a-ops2",
      group: "operations",
      name: "Warehouse ops",
      ownerName: "Maya",
      reportsTo: "Zed",
      sortOrder: 4,
    });
    expect(screen.getByRole("dialog", { name: "Manage areas" })).toBeInTheDocument();
  });

  it("requires a name when saving a row", async () => {
    const user = userEvent.setup();
    const dialog = await openManage(user);
    const row = rowOf(dialog, "Pipelines");

    setIn(row, "Name", "   ");
    await user.click(within(row).getByRole("button", { name: "Save" }));
    expect(within(row).getByText("Name is required.")).toBeInTheDocument();
    expect(saveOpsArea).not.toHaveBeenCalled();
  });

  it("announces the name error and links it to the input", async () => {
    const user = userEvent.setup();
    const dialog = await openManage(user);
    const row = rowOf(dialog, "Pipelines");

    setIn(row, "Name", "   ");
    await user.click(within(row).getByRole("button", { name: "Save" }));
    const error = within(row).getByText("Name is required.");
    expect(error).toHaveAttribute("role", "alert");
    expect(error.id).toBeTruthy();
    expect(within(row).getByLabelText("Name")).toHaveAttribute("aria-describedby", error.id);
  });

  it("groups each row with a div inside its list item", async () => {
    const user = userEvent.setup();
    const dialog = await openManage(user);
    const row = rowOf(dialog, "Pipelines");
    expect(row.tagName).toBe("DIV");
    expect(row.parentElement?.tagName).toBe("LI");
    expect(row.parentElement).not.toHaveAttribute("role");
  });

  it("shows a save error inline and keeps the draft", async () => {
    const user = userEvent.setup();
    saveOpsArea.mockRejectedValueOnce(new Error("Saving failed: area Pipelines already exists"));
    const dialog = await openManage(user);
    const row = rowOf(dialog, "Warehouse");

    setIn(row, "Name", "Pipelines");
    await user.click(within(row).getByRole("button", { name: "Save" }));

    expect(await within(row).findByRole("alert")).toHaveTextContent("Saving failed: area Pipelines already exists");
    expect(within(row).getByLabelText("Name")).toHaveValue("Pipelines");
    expect(refresh).not.toHaveBeenCalled();
  });

  it("adds an area with sortOrder one above the largest in its group", async () => {
    const user = userEvent.setup();
    const dialog = await openManage(user);
    const add = within(dialog).getByRole("group", { name: "Add area to Data Lake Operations" });

    setIn(add, "Name", " Quality ");
    setIn(add, "Owner", "Nora");
    setIn(add, "Reports to", "Dina");
    await user.click(within(add).getByRole("button", { name: "Add" }));

    await vi.waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(saveOpsArea).toHaveBeenCalledWith(fakeClient, {
      group: "operations",
      name: "Quality",
      ownerName: "Nora",
      reportsTo: "Dina",
      sortOrder: 5,
    });
    expect(within(add).getByLabelText("Name")).toHaveValue("");
  });

  it("starts an empty group at sort order 0 and requires a name", async () => {
    const user = userEvent.setup();
    const dialog = await openManage(user);
    const add = within(dialog).getByRole("group", { name: "Add area to Demand Projects" });

    await user.click(within(add).getByRole("button", { name: "Add" }));
    expect(within(add).getByText("Name is required.")).toBeInTheDocument();
    expect(saveOpsArea).not.toHaveBeenCalled();

    setIn(add, "Name", "Campaigns");
    await user.click(within(add).getByRole("button", { name: "Add" }));
    await vi.waitFor(() => expect(saveOpsArea).toHaveBeenCalledTimes(1));
    expect(saveOpsArea.mock.calls[0][1]).toMatchObject({ group: "demand", name: "Campaigns", sortOrder: 0 });
  });

  it("confirms before deleting, keeps drafts on cancel, then deletes and refreshes", async () => {
    const user = userEvent.setup();
    const dialog = await openManage(user);
    setIn(rowOf(dialog, "Pipelines"), "Owner", "Draft owner");

    await user.click(within(rowOf(dialog, "Pipelines")).getByRole("button", { name: "Delete" }));
    let confirm = await screen.findByRole("dialog", { name: "Delete Pipelines?" });
    expect(within(confirm).getByText("Delete Pipelines? Its issues become Unrouted.")).toBeInTheDocument();
    expect(deleteOpsArea).not.toHaveBeenCalled();

    await user.click(within(confirm).getByRole("button", { name: "Cancel" }));
    expect(deleteOpsArea).not.toHaveBeenCalled();
    const back = await screen.findByRole("dialog", { name: "Manage areas" });
    expect(within(rowOf(back, "Pipelines")).getByLabelText("Owner")).toHaveValue("Draft owner");

    await user.click(within(rowOf(back, "Pipelines")).getByRole("button", { name: "Delete" }));
    confirm = await screen.findByRole("dialog", { name: "Delete Pipelines?" });
    await user.click(within(confirm).getByRole("button", { name: "Delete" }));

    await vi.waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(deleteOpsArea).toHaveBeenCalledTimes(1);
    expect(deleteOpsArea).toHaveBeenCalledWith(fakeClient, "a-ops1");
    expect(await screen.findByRole("dialog", { name: "Manage areas" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "Delete Pipelines?" })).not.toBeInTheDocument();
  });

  it("shows a delete error in the confirmation", async () => {
    const user = userEvent.setup();
    deleteOpsArea.mockRejectedValueOnce(new Error("Only admins can change Ops Requests."));
    const dialog = await openManage(user);

    await user.click(within(rowOf(dialog, "Pipelines")).getByRole("button", { name: "Delete" }));
    const confirm = await screen.findByRole("dialog", { name: "Delete Pipelines?" });
    await user.click(within(confirm).getByRole("button", { name: "Delete" }));

    expect(await within(confirm).findByRole("alert")).toHaveTextContent("Only admins can change Ops Requests.");
    expect(refresh).not.toHaveBeenCalled();
  });

  it("closes from the close button", async () => {
    const user = userEvent.setup();
    const dialog = await openManage(user);
    await user.click(within(dialog).getByRole("button", { name: "Close manage areas" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

describe("Escalation setting", () => {
  async function openEscalation(user: ReturnType<typeof userEvent.setup>) {
    renderView();
    await openIssuesTab(user);
    await user.click(screen.getByRole("button", { name: "Escalation: 12 days" }));
    return screen.findByRole("dialog", { name: "Escalation days" });
  }

  it("shows the current value and saves a new one, then refreshes and closes", async () => {
    const user = userEvent.setup();
    const dialog = await openEscalation(user);
    expect(within(dialog).getByLabelText("Days")).toHaveValue(12);

    setIn(dialog, "Days", "30");
    await user.click(within(dialog).getByRole("button", { name: "Save" }));

    await vi.waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(saveOpsSettings).toHaveBeenCalledWith(fakeClient, 30);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it.each(["0", "366", "2.5", ""])("rejects %j with the validation message", async (value) => {
    const user = userEvent.setup();
    const dialog = await openEscalation(user);

    setIn(dialog, "Days", value);
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(within(dialog).getByText("Enter a whole number of days from 1 to 365.")).toBeInTheDocument();
    expect(saveOpsSettings).not.toHaveBeenCalled();
  });

  it("accepts the boundaries 1 and 365", async () => {
    const user = userEvent.setup();
    const dialog = await openEscalation(user);
    setIn(dialog, "Days", "365");
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    await vi.waitFor(() => expect(saveOpsSettings).toHaveBeenCalledWith(fakeClient, 365));
  });

  it("keeps the dialog open with the error when saving fails", async () => {
    const user = userEvent.setup();
    saveOpsSettings.mockRejectedValueOnce(new Error("Saving failed: boom"));
    const dialog = await openEscalation(user);

    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Saving failed: boom");
    expect(refresh).not.toHaveBeenCalled();
  });

  it("cannot be closed with Escape while saving", async () => {
    const user = userEvent.setup();
    let finish: () => void = () => {};
    saveOpsSettings.mockReturnValueOnce(new Promise<void>((resolve) => { finish = resolve; }));
    const dialog = await openEscalation(user);

    fireEvent.submit(dialog.querySelector("form")!);
    fireEvent.keyDown(document, { key: "Escape" });
    await user.click(within(dialog).getByRole("button", { name: "Close escalation settings" }));
    expect(screen.getByRole("dialog", { name: "Escalation days" })).toBeInTheDocument();

    finish();
    await vi.waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("blocks double submits while saving", async () => {
    const user = userEvent.setup();
    let finish: () => void = () => {};
    saveOpsSettings.mockReturnValueOnce(new Promise<void>((resolve) => { finish = resolve; }));
    const dialog = await openEscalation(user);

    const form = dialog.querySelector("form")!;
    fireEvent.submit(form);
    fireEvent.submit(form);
    expect(saveOpsSettings).toHaveBeenCalledTimes(1);
    finish();
    await vi.waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
  });
});
