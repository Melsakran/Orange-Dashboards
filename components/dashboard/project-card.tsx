import type { DragEvent, KeyboardEvent, MouseEvent } from "react";
import type {
  DashboardProject,
  DashboardWorkItem,
  OpsHealthStatus,
} from "@/lib/data/dashboard";
import { ProgressBar } from "@/components/ui/progress-bar";
import { formatCardDate, formatWorkingDays } from "@/lib/dashboard/card-format";

interface ProjectCardProps {
  project: DashboardProject;
  onOpen: (project: DashboardProject) => void;
  showOwner?: boolean;
  ownerRoleLabel?: string;
  showProgress?: boolean;
  showDetailsButton?: boolean;
  showDescription?: boolean;
  descriptionLabel?: string;
  openOnCardClick?: boolean;
  showOverdueTag?: boolean;
  showChildHierarchy?: boolean;
  showReleaseTag?: boolean;
  scheduleMode?: "dates" | "ops-health" | "delivery";
  startDateLabel?: string;
  endDateLabel?: string;
  selected?: boolean;
  onSelectedChange?: (selected: boolean) => void;
  dragControls?: {
    onDragStart: (event: DragEvent<HTMLElement>) => void;
    onDragOver: (event: DragEvent<HTMLElement>) => void;
    onDragLeave: (event: DragEvent<HTMLElement>) => void;
    onDrop: (event: DragEvent<HTMLElement>) => void;
    onDragEnd: () => void;
    isDragging?: boolean;
    isDropTarget?: boolean;
  };
  adminControls?: {
    onEdit: () => void;
    onDelete: () => void;
  };
}

function isPastTargetDate(endDate?: string) {
  if (!endDate) return false;
  const target = new Date(`${endDate}T00:00:00Z`);
  if (Number.isNaN(target.getTime())) return false;
  const now = new Date();
  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return target.getTime() < todayUtc;
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function formatOpsHealthStatus(value?: OpsHealthStatus) {
  return value ?? "Not set";
}

function stopCardActivation(event: MouseEvent | KeyboardEvent) {
  event.stopPropagation();
}

function JiraKey({ item }: { item: DashboardWorkItem }) {
  if (!item.jiraIssueKey) return null;
  return (
    <span className="jira-key" onClick={stopCardActivation} onKeyDown={stopCardActivation}>
      {item.jiraUrl ? (
        <a href={item.jiraUrl} target="_blank" rel="noreferrer">
          {item.jiraIssueKey}
        </a>
      ) : (
        item.jiraIssueKey
      )}
    </span>
  );
}

export function ProjectCard({
  project,
  onOpen,
  showOwner = true,
  ownerRoleLabel = "Project owner",
  showProgress = true,
  showDetailsButton = true,
  showDescription = false,
  descriptionLabel = "Description",
  openOnCardClick = false,
  showOverdueTag = false,
  showChildHierarchy = false,
  showReleaseTag = false,
  scheduleMode = "dates",
  startDateLabel = "Start",
  endDateLabel = "Target",
  selected = false,
  onSelectedChange,
  dragControls,
  adminControls,
}: ProjectCardProps) {
  const childCount = project.subtasks.length;
  const overdue = showOverdueTag && isPastTargetDate(project.endDate);
  const cardClassName = [
    openOnCardClick ? "project-card project-card-clickable" : "project-card",
    dragControls?.isDragging ? "project-card-dragging" : "",
    dragControls?.isDropTarget ? "project-card-drop-target" : "",
    selected ? "project-card-selected" : "",
  ].filter(Boolean).join(" ");
  const releaseTag = project.releaseTag?.trim();

  return (
    <article
      className={cardClassName}
      role={openOnCardClick ? "button" : undefined}
      tabIndex={openOnCardClick ? 0 : undefined}
      aria-label={openOnCardClick ? `View ${project.title} details` : undefined}
      onDragOver={dragControls?.onDragOver}
      onDragLeave={dragControls?.onDragLeave}
      onDrop={dragControls?.onDrop}
      onClick={openOnCardClick ? () => onOpen(project) : undefined}
      onKeyDown={
        openOnCardClick
          ? (event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onOpen(project);
              }
            }
          : undefined
      }
    >
      {adminControls || onSelectedChange || dragControls ? (
        <div
          className="project-card-admin-bar"
          onClick={stopCardActivation}
          onKeyDown={stopCardActivation}
        >
          {onSelectedChange ? (
            <label className="project-select">
              <input
                type="checkbox"
                checked={selected}
                onChange={(event) => onSelectedChange(event.target.checked)}
                aria-label={`Select ${project.title}`}
              />
              <span>Select</span>
            </label>
          ) : null}
          {dragControls ? (
            <button
              type="button"
              className="drag-handle"
              draggable
              aria-label={`Drag to reorder ${project.title}`}
              onDragStart={dragControls.onDragStart}
              onDragEnd={dragControls.onDragEnd}
            >
              Drag to reorder
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="project-heading">
        <div>
          <div className="project-meta-row">
            <p className="status-badge">
              <span aria-hidden="true" style={{ backgroundColor: project.statusColor }} />
              {project.statusName}
            </p>
            {showReleaseTag && releaseTag ? (
              <p className="release-tag" aria-label={`Release ${releaseTag}`}>
                {releaseTag}
              </p>
            ) : null}
            {overdue ? (
              <p className="overdue-badge" aria-label="Target date passed">
                Delayed
              </p>
            ) : null}
            {showChildHierarchy ? (
              <p className="hierarchy-badge" aria-label="Parent work item">
                Parent
                {childCount ? ` · ${childCount} child${childCount === 1 ? "" : "ren"}` : ""}
              </p>
            ) : null}
          </div>
          <h2>
            {project.title}
            <JiraKey item={project} />
          </h2>
        </div>
        <span className={`priority priority-${project.priority}`}>{project.priority}</span>
      </div>

      {showOwner ? (
        <div className="owner">
          <span className="owner-avatar" aria-hidden="true">
            {initials(project.owner)}
          </span>
          <span>
            <strong>{project.owner}</strong>
            <small>
              {ownerRoleLabel !== "Project owner"
                ? ownerRoleLabel
                : (project.ownerRole ?? ownerRoleLabel)}
            </small>
          </span>
        </div>
      ) : null}

      {showDescription && project.description.trim() ? (
        <section
          className="project-card-description"
          aria-label={`${project.title} ${descriptionLabel.toLowerCase()}`}
        >
          <h3>{descriptionLabel}</h3>
          <div className="project-card-description-body">
            <p>{project.description}</p>
          </div>
        </section>
      ) : null}

      {showProgress ? (
        <ProgressBar label={`${project.title} progress`} value={project.progress} />
      ) : null}

      {project.teamTracks?.length ? (
        <section
          className="project-team-tracks"
          aria-label={`${project.title} team schedules`}
        >
          <h3>Teams</h3>
          <ul>
            {project.teamTracks.map((track) => {
              const hasSchedule = Boolean(track.startDate || track.endDate);
              return (
              <li key={track.id}>
                <div className="project-team-track-heading">
                  <strong>{track.teamName}</strong>
                  <p className="status-badge">
                    <span aria-hidden="true" style={{ backgroundColor: track.statusColor }} />
                    {track.statusName}
                  </p>
                </div>
                {hasSchedule ? (
                  <dl className="project-dates project-dates-compact">
                    <div>
                      <dt>{`${track.teamName} Start Date`}</dt>
                      <dd>{formatCardDate(track.startDate)}</dd>
                    </div>
                    <div>
                      <dt>{`${track.teamName} End Date`}</dt>
                      <dd>{formatCardDate(track.endDate)}</dd>
                    </div>
                  </dl>
                ) : null}
              </li>
              );
            })}
          </ul>
        </section>
      ) : (
        <dl className="project-dates">
          {scheduleMode === "ops-health" ? (
            <>
              <div>
                <dt>Last Week Status</dt>
                <dd data-ops-health={project.lastWeekStatus ?? "unset"}>
                  {formatOpsHealthStatus(project.lastWeekStatus)}
                </dd>
              </div>
              <div>
                <dt>Current Status</dt>
                <dd data-ops-health={project.currentStatus ?? "unset"}>
                  {formatOpsHealthStatus(project.currentStatus)}
                </dd>
              </div>
            </>
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
          ) : (
            <>
              <div>
                <dt>{startDateLabel}</dt>
                <dd>{formatCardDate(project.startDate)}</dd>
              </div>
              <div>
                <dt>{endDateLabel}</dt>
                <dd className={overdue ? "project-date-overdue" : undefined}>
                  {formatCardDate(project.endDate)}
                </dd>
              </div>
            </>
          )}
        </dl>
      )}

      {showChildHierarchy ? (
        <section
          className="project-card-children"
          aria-label={`${project.title} child work items`}
        >
          <h3>Children</h3>
          {childCount ? (
            <ul>
              {project.subtasks.map((child) => (
                <li key={child.id}>
                  <div className="project-card-child-heading">
                    <span
                      className="status-dot"
                      aria-hidden="true"
                      style={{ backgroundColor: child.statusColor }}
                    />
                    <strong>{child.title}</strong>
                    <JiraKey item={child} />
                  </div>
                  <small>
                    {child.statusName}
                    {" · "}
                    {child.progress}%
                    {child.owner ? ` · ${child.owner}` : ""}
                  </small>
                </li>
              ))}
            </ul>
          ) : (
            <p className="project-card-children-empty">No child work items.</p>
          )}
        </section>
      ) : null}

      {showDetailsButton ? (
        <button className="details-button" type="button" onClick={() => onOpen(project)}>
          View {project.title} details
        </button>
      ) : null}
      {adminControls ? (
        <div
          className="admin-actions"
          aria-label={`${project.title} administration`}
          onClick={stopCardActivation}
          onKeyDown={stopCardActivation}
        >
          <button type="button" onClick={adminControls.onEdit}>
            Edit {project.title}
          </button>
          <button
            className="delete-button"
            type="button"
            onClick={adminControls.onDelete}
            aria-label={`Delete ${project.title}`}
          >
            Delete
          </button>
        </div>
      ) : null}
    </article>
  );
}
