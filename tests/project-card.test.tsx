import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ProjectCard } from "@/components/dashboard/project-card";
import type { DashboardProject } from "@/lib/data/dashboard";

function makeProject(overrides: Partial<DashboardProject> = {}): DashboardProject {
  return {
    id: "p1",
    title: "Sample project",
    description: "",
    status: "in-progress",
    statusId: "s1",
    statusName: "Planning",
    statusColor: "#23b123",
    reportingCategory: "active",
    owner: "Alex Owner",
    ownerRole: "Lead",
    priority: "medium",
    progress: 40,
    startDate: "2026-01-01",
    endDate: "2020-01-01",
    sortOrder: 0,
    updatedAt: "2026-01-01T00:00:00.000Z",
    syncSource: "jira",
    comments: [],
    subtasks: [],
    ...overrides,
  };
}

describe("ProjectCard Dev Ops options", () => {
  it("hides owner, progress, and view button while opening on card click", async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    render(
      <ProjectCard
        project={makeProject()}
        onOpen={onOpen}
        showOwner={false}
        showProgress={false}
        showDetailsButton={false}
        openOnCardClick
        showOverdueTag
      />,
    );

    expect(screen.queryByText("Alex Owner")).not.toBeInTheDocument();
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    expect(document.querySelector(".details-button")).toBeNull();
    expect(screen.getByLabelText("Target date passed")).toHaveTextContent("Delayed");

    await user.click(screen.getByRole("button", { name: "View Sample project details" }));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("does not show overdue tag when target date is in the future", () => {
    render(
      <ProjectCard
        project={makeProject({ endDate: "2099-12-31" })}
        onOpen={() => undefined}
        showOverdueTag
      />,
    );
    expect(screen.queryByLabelText("Target date passed")).not.toBeInTheDocument();
  });

  it("shows PE Ops week statuses and description", () => {
    render(
      <ProjectCard
        project={makeProject({
          description: "Ops notes for this week",
          lastWeekStatus: "Clear",
          currentStatus: "Delayed",
        })}
        onOpen={() => undefined}
        showOwner={false}
        showProgress={false}
        showDetailsButton={false}
        showDescription
        scheduleMode="ops-health"
        openOnCardClick
      />,
    );

    expect(screen.getByText("Last Week Status")).toBeInTheDocument();
    expect(screen.getByText("Current Status")).toBeInTheDocument();
    expect(screen.getByText("Clear")).toBeInTheDocument();
    expect(screen.getAllByText("Delayed").length).toBeGreaterThan(0);
    expect(screen.getByText("Ops notes for this week")).toBeInTheDocument();
    expect(screen.queryByText("Start")).not.toBeInTheDocument();
    expect(screen.queryByText("Target")).not.toBeInTheDocument();
  });

  it("labels the description block as Comments for Data Lake Ops", () => {
    render(
      <ProjectCard
        project={makeProject({ description: "Feed delay notes" })}
        onOpen={() => undefined}
        showDescription
        descriptionLabel="Comments"
        scheduleMode="ops-health"
      />,
    );

    expect(screen.getByText("Comments")).toBeInTheDocument();
    expect(screen.getByText("Feed delay notes")).toBeInTheDocument();
    expect(screen.queryByText("Description")).not.toBeInTheDocument();
  });

  it("shows per-team status and dated fields for Data Lake cards", () => {
    render(
      <ProjectCard
        project={makeProject({
          statusName: "In Progress",
          owner: "Sam Digital",
          teamTracks: [
            {
              id: "t1",
              teamName: "Data Lake",
              statusId: "s-progress",
              statusName: "In Progress",
              statusColor: "#237b4b",
              startDate: "2026-03-01",
              endDate: "2026-04-15",
              sortOrder: 0,
            },
            {
              id: "t2",
              teamName: "Analytics",
              statusId: "s-pending",
              statusName: "Pending",
              statusColor: "#f59e0b",
              startDate: "2026-03-10",
              endDate: "2026-05-01",
              sortOrder: 1,
            },
          ],
        })}
        onOpen={() => undefined}
        showOwner
        ownerRoleLabel="Action Owner"
        showProgress={false}
        showDetailsButton={false}
        openOnCardClick
      />,
    );

    expect(screen.getByText("Data Lake Start Date")).toBeInTheDocument();
    expect(screen.getByText("Data Lake End Date")).toBeInTheDocument();
    expect(screen.getByText("Analytics Start Date")).toBeInTheDocument();
    expect(screen.getByText("Analytics End Date")).toBeInTheDocument();
    expect(screen.getAllByText("In Progress").length).toBeGreaterThan(0);
    expect(screen.getByText("Pending")).toBeInTheDocument();
    expect(screen.queryByText("Start Date")).not.toBeInTheDocument();
    expect(screen.queryByText("RFT Date")).not.toBeInTheDocument();
  });

  it("hides team date fields when both start and end dates are empty", () => {
    render(
      <ProjectCard
        project={makeProject({
          teamTracks: [
            {
              id: "t1",
              teamName: "Analytics",
              statusId: "s-pending",
              statusName: "Pending",
              statusColor: "#f59e0b",
              sortOrder: 0,
            },
          ],
        })}
        onOpen={() => undefined}
        showProgress={false}
        showDetailsButton={false}
        openOnCardClick
      />,
    );

    expect(screen.getByText("Analytics")).toBeInTheDocument();
    expect(screen.getByText("Pending")).toBeInTheDocument();
    expect(screen.queryByText("Analytics Start Date")).not.toBeInTheDocument();
    expect(screen.queryByText("Analytics End Date")).not.toBeInTheDocument();
    expect(screen.queryByText("Not scheduled")).not.toBeInTheDocument();
  });

  it("shows Digital card fields: Action Owner, Start/RFT dates, Release tag, and Comments", () => {
    render(
      <ProjectCard
        project={makeProject({
          statusName: "In Progress",
          owner: "Sam Digital",
          releaseTag: "R12",
          startDate: "2026-03-01",
          endDate: "2026-04-15",
          description: "Waiting on creative assets",
        })}
        onOpen={() => undefined}
        showOwner
        ownerRoleLabel="Action Owner"
        showProgress={false}
        showDetailsButton={false}
        showDescription
        descriptionLabel="Comments"
        showReleaseTag
        startDateLabel="Start Date"
        endDateLabel="RFT Date"
        openOnCardClick
      />,
    );

    expect(screen.getByText("Sam Digital")).toBeInTheDocument();
    expect(screen.getByText("Action Owner")).toBeInTheDocument();
    expect(screen.getByText("Start Date")).toBeInTheDocument();
    expect(screen.getByText("RFT Date")).toBeInTheDocument();
    expect(screen.getByLabelText("Release R12")).toHaveTextContent("R12");
    expect(screen.getByText("Comments")).toBeInTheDocument();
    expect(screen.getByText("Waiting on creative assets")).toBeInTheDocument();
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    expect(screen.queryByText("Last Week Status")).not.toBeInTheDocument();
  });
});

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
