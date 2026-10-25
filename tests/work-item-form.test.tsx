import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { WorkItemForm, validateWorkItemDraft } from "@/components/admin/work-item-form";

const statuses = [
  {
    id: "status-a",
    name: "In Progress",
    color: "#123456",
    sortOrder: 0,
    reportingCategory: "active" as const,
    updatedAt: "",
  },
];

const emptyDraft = {
  title: "Project",
  description: "",
  statusId: "status-a",
  priority: "medium" as const,
  progress: "10",
  startDate: "",
  endDate: "",
  lastWeekStatus: "",
  currentStatus: "",
  assignee: "",
  releaseTag: "",
};

describe("validateWorkItemDraft", () => {
  it("requires a title and status", () => {
    expect(validateWorkItemDraft({
      ...emptyDraft,
      title: " ",
      statusId: "",
      progress: "0",
    })).toEqual({
      title: "Title is required.",
      statusId: "Status is required.",
    });
  });

  it.each(["-1", "101", "not-a-number"])("rejects invalid progress %s", (progress) => {
    expect(validateWorkItemDraft({
      ...emptyDraft,
      progress,
    }).progress).toBe("Progress must be a whole number from 0 to 100.");
  });

  it("treats blank progress as required instead of coercing it to zero", () => {
    expect(validateWorkItemDraft({
      ...emptyDraft,
      progress: "   ",
    }).progress).toBe("Progress is required.");
  });

  it("rejects an end date before the start date", () => {
    expect(validateWorkItemDraft({
      ...emptyDraft,
      startDate: "2026-07-20",
      endDate: "2026-07-19",
    }).endDate).toBe("End date must be on or after the start date.");
  });

  it("enforces work-item text bounds", () => {
    const base = emptyDraft;
    expect(validateWorkItemDraft({ ...base, title: "x".repeat(201) }).title)
      .toMatch(/200 characters/i);
    expect(validateWorkItemDraft({ ...base, assignee: "x".repeat(201) }).assignee)
      .toMatch(/200 characters/i);
    expect(validateWorkItemDraft({ ...base, description: "x".repeat(10_001) }).description)
      .toMatch(/10000 characters/i);
  });

  it("requires unique team tracks when team schedules are enabled", () => {
    const errors = validateWorkItemDraft(emptyDraft, "dates", {
      requireProgress: false,
      requireTeamTracks: true,
      teamTracks: [
        {
          key: "a",
          teamName: "Data Lake",
          statusId: "status-a",
          startDate: "2026-03-01",
          endDate: "2026-02-01",
        },
        {
          key: "b",
          teamName: "data lake",
          statusId: "status-a",
          startDate: "",
          endDate: "",
        },
      ],
    });
    expect(errors.teamTrackFields?.a?.endDate).toMatch(/on or after/i);
    expect(errors.teamTrackFields?.b?.teamName).toMatch(/unique/i);
  });

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
});

describe("WorkItemForm", () => {
  it("submits a normalized project payload once while saving", async () => {
    const user = userEvent.setup();
    let resolveSubmit!: () => void;
    const onSubmit = vi.fn(() => new Promise<void>((resolve) => {
      resolveSubmit = resolve;
    }));
    render(
      <WorkItemForm
        kind="project"
        statuses={statuses}
        onSubmit={onSubmit}
        onCancel={vi.fn()}
      />,
    );

    await user.type(screen.getByLabelText("Title"), "  New project  ");
    await user.type(screen.getByLabelText("Description"), " Description ");
    await user.clear(screen.getByLabelText("Progress"));
    await user.type(screen.getByLabelText("Progress"), "35");
    await user.type(screen.getByLabelText("Assignee"), " Avery ");
    await user.click(screen.getByRole("button", { name: "Create project" }));
    await user.click(screen.getByRole("button", { name: "Saving" }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith({
      title: "New project",
      description: "Description",
      statusId: "status-a",
      priority: "medium",
      progress: 35,
      startDate: null,
      endDate: null,
      lastWeekStatus: null,
      currentStatus: null,
      assignee: "Avery",
      releaseTag: null,
    });
    resolveSubmit();
  });

  it("shows clear validation errors without submitting", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <WorkItemForm
        kind="subtask"
        statuses={statuses}
        onSubmit={onSubmit}
        onCancel={vi.fn()}
      />,
    );

    await user.clear(screen.getByLabelText("Progress"));
    await user.type(screen.getByLabelText("Progress"), "150");
    await user.click(screen.getByRole("button", { name: "Create subtask" }));

    expect(screen.getByText("Title is required.")).toBeInTheDocument();
    expect(screen.getByText("Progress must be a whole number from 0 to 100.")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("exposes matching browser text limits", () => {
    render(
      <WorkItemForm
        kind="project"
        statuses={statuses}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByLabelText("Title")).toHaveAttribute("maxlength", "200");
    expect(screen.getByLabelText("Description")).toHaveAttribute("maxlength", "10000");
    expect(screen.getByLabelText("Assignee")).toHaveAttribute("maxlength", "200");
  });

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
});
