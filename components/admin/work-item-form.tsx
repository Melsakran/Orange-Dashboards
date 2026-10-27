"use client";

import { useRef, useState, type FormEvent } from "react";
import type { ProjectPriority } from "@/data/workspaces";
import { parseWorkingDays, WORKING_DAYS_ERROR } from "@/lib/dashboard/card-format";
import {
  projectTierOf,
  type DashboardStatus,
  type DashboardWorkItem,
  type OpsHealthStatus,
  type ProjectTier,
} from "@/lib/data/dashboard";

export interface TeamTrackDraft {
  key: string;
  teamName: string;
  statusId: string;
  startDate: string;
  endDate: string;
}

export interface WorkItemDraftFields {
  title: string;
  description: string;
  statusId: string;
  priority: ProjectPriority;
  progress: string;
  startDate: string;
  endDate: string;
  lastWeekStatus: string;
  currentStatus: string;
  assignee: string;
  releaseTag: string;
  readinessDate?: string;
  teamEffortWd?: string;
  timeToMarketWd?: string;
  projectTier?: ProjectTier;
}

export interface WorkItemFormValue {
  title: string;
  description: string;
  statusId: string;
  priority: ProjectPriority;
  progress: number;
  startDate: string | null;
  endDate: string | null;
  lastWeekStatus: OpsHealthStatus | null;
  currentStatus: OpsHealthStatus | null;
  assignee: string | null;
  releaseTag: string | null;
  readinessDate?: string | null;
  teamEffortWd?: number | null;
  timeToMarketWd?: number | null;
  projectTier?: ProjectTier;
  teamTracks?: Array<{
    teamName: string;
    statusId: string;
    startDate: string | null;
    endDate: string | null;
  }>;
}

export type WorkItemFormErrors = Partial<Record<keyof WorkItemDraftFields, string>> & {
  teamTracks?: string;
  teamTrackFields?: Record<string, Partial<Record<"teamName" | "statusId" | "endDate", string>>>;
};

const OPS_HEALTH_OPTIONS: OpsHealthStatus[] = ["Clear", "Delayed"];

function asOpsHealthStatus(value: string): OpsHealthStatus | null {
  return value === "Clear" || value === "Delayed" ? value : null;
}

function newTrackKey() {
  return globalThis.crypto?.randomUUID?.() ?? `track-${Date.now()}-${Math.random()}`;
}

function teamFieldLabel(teamName: string, field: "Start Date" | "End Date" | "Status") {
  const label = teamName.trim() || "Team";
  return `${label} ${field}`;
}

export function validateWorkItemDraft(
  fields: WorkItemDraftFields,
  scheduleMode: "dates" | "ops-health" = "dates",
  options: {
    requireProgress?: boolean;
    teamTracks?: TeamTrackDraft[];
    requireTeamTracks?: boolean;
    deliveryFields?: boolean;
  } = {},
): WorkItemFormErrors {
  const requireProgress = options.requireProgress ?? true;
  const errors: WorkItemFormErrors = {};
  if (!fields.title.trim()) errors.title = "Title is required.";
  else if (fields.title.trim().length > 200) errors.title = "Title must be 200 characters or fewer.";
  if (fields.description.trim().length > 10_000) {
    errors.description = "Description must be 10000 characters or fewer.";
  }
  if (fields.assignee.trim().length > 200) {
    errors.assignee = "Assignee must be 200 characters or fewer.";
  }
  if (fields.releaseTag.trim().length > 100) {
    errors.releaseTag = "Release must be 100 characters or fewer.";
  }

  if (options.requireTeamTracks) {
    const tracks = options.teamTracks ?? [];
    if (!tracks.length) {
      errors.teamTracks = "Add at least one team with status and dates.";
    } else {
      const trackFieldErrors: NonNullable<WorkItemFormErrors["teamTrackFields"]> = {};
      const seenNames = new Set<string>();
      tracks.forEach((track) => {
        const fieldErrors: Partial<Record<"teamName" | "statusId" | "endDate", string>> = {};
        const name = track.teamName.trim();
        if (!name) fieldErrors.teamName = "Team name is required.";
        else if (name.length > 100) fieldErrors.teamName = "Team name must be 100 characters or fewer.";
        else {
          const key = name.toLowerCase();
          if (seenNames.has(key)) fieldErrors.teamName = "Team names must be unique.";
          seenNames.add(key);
        }
        if (!track.statusId) fieldErrors.statusId = "Status is required.";
        if (track.startDate && track.endDate && track.endDate < track.startDate) {
          fieldErrors.endDate = "End date must be on or after the start date.";
        }
        if (Object.keys(fieldErrors).length) {
          trackFieldErrors[track.key] = fieldErrors;
        }
      });
      if (Object.keys(trackFieldErrors).length) {
        errors.teamTrackFields = trackFieldErrors;
      }
      if (!errors.statusId && !tracks.some((track) => track.statusId)) {
        errors.statusId = "Status is required.";
      }
    }
  } else if (!fields.statusId) {
    errors.statusId = "Status is required.";
  }

  const progressText = fields.progress.trim();
  const progress = Number(progressText);
  if (requireProgress) {
    if (!progressText) {
      errors.progress = "Progress is required.";
    } else if (!Number.isInteger(progress) || progress < 0 || progress > 100) {
      errors.progress = "Progress must be a whole number from 0 to 100.";
    }
  } else if (
    progressText
    && (!Number.isInteger(progress) || progress < 0 || progress > 100)
  ) {
    errors.progress = "Progress must be a whole number from 0 to 100.";
  }
  if (!options.requireTeamTracks && scheduleMode === "dates") {
    if (fields.startDate && fields.endDate && fields.endDate < fields.startDate) {
      errors.endDate = options.deliveryFields
        ? "Deployment Date must be on or after the Start Date."
        : "End date must be on or after the start date.";
    }
    if (options.deliveryFields) {
      const readinessDate = fields.readinessDate ?? "";
      if (readinessDate && fields.endDate && readinessDate < fields.endDate) {
        errors.readinessDate = "Readiness Date must be on or after the Deployment Date.";
      } else if (readinessDate && fields.startDate && readinessDate < fields.startDate) {
        errors.readinessDate = "Readiness Date must be on or after the Start Date.";
      }
      if (parseWorkingDays(fields.teamEffortWd ?? "") === undefined) {
        errors.teamEffortWd = WORKING_DAYS_ERROR;
      }
      if (parseWorkingDays(fields.timeToMarketWd ?? "") === undefined) {
        errors.timeToMarketWd = WORKING_DAYS_ERROR;
      }
    }
  } else if (scheduleMode === "ops-health") {
    if (fields.lastWeekStatus && !asOpsHealthStatus(fields.lastWeekStatus)) {
      errors.lastWeekStatus = "Choose Clear or Delayed.";
    }
    if (fields.currentStatus && !asOpsHealthStatus(fields.currentStatus)) {
      errors.currentStatus = "Choose Clear or Delayed.";
    }
  }
  return errors;
}

function initialFields(
  statuses: DashboardStatus[],
  value?: DashboardWorkItem,
  defaultProjectTier: ProjectTier = "standard",
): WorkItemDraftFields {
  return {
    title: value?.title ?? "",
    description: value?.description ?? "",
    statusId: value?.statusId ?? statuses[0]?.id ?? "",
    priority: value?.priority ?? "medium",
    progress: String(value?.progress ?? 0),
    startDate: value?.startDate ?? "",
    endDate: value?.endDate ?? "",
    lastWeekStatus: value?.lastWeekStatus ?? "",
    currentStatus: value?.currentStatus ?? "",
    assignee: value?.owner === "Unassigned" ? "" : value?.owner ?? "",
    releaseTag: value?.releaseTag ?? "",
    readinessDate: value?.readinessDate ?? "",
    teamEffortWd: value?.teamEffortWd?.toString() ?? "",
    timeToMarketWd: value?.timeToMarketWd?.toString() ?? "",
    projectTier: value ? projectTierOf(value) : defaultProjectTier,
  };
}

function initialTeamTracks(
  statuses: DashboardStatus[],
  value?: DashboardWorkItem,
): TeamTrackDraft[] {
  if (value?.teamTracks?.length) {
    return value.teamTracks.map((track) => ({
      key: track.id || newTrackKey(),
      teamName: track.teamName,
      statusId: track.statusId,
      startDate: track.startDate ?? "",
      endDate: track.endDate ?? "",
    }));
  }
  return [{
    key: newTrackKey(),
    teamName: "",
    statusId: statuses[0]?.id ?? "",
    startDate: "",
    endDate: "",
  }];
}

interface WorkItemFormProps {
  kind: "project" | "subtask";
  statuses: DashboardStatus[];
  initialValue?: DashboardWorkItem;
  scheduleMode?: "dates" | "ops-health";
  descriptionLabel?: string;
  assigneeLabel?: string;
  startDateLabel?: string;
  endDateLabel?: string;
  showDescription?: boolean;
  showProgress?: boolean;
  showRelease?: boolean;
  useTeamTracks?: boolean;
  deliveryFields?: boolean;
  showProjectTier?: boolean;
  defaultProjectTier?: ProjectTier;
  onSubmit: (value: WorkItemFormValue) => Promise<void>;
  onCancel: () => void;
}

export function WorkItemForm({
  kind,
  statuses,
  initialValue,
  scheduleMode = "dates",
  descriptionLabel = "Description",
  assigneeLabel = "Assignee",
  startDateLabel = "Start date",
  endDateLabel = "End date",
  showDescription = true,
  showProgress = true,
  showRelease = false,
  useTeamTracks = false,
  deliveryFields = false,
  showProjectTier = false,
  defaultProjectTier = "standard",
  onSubmit,
  onCancel,
}: WorkItemFormProps) {
  // The form is intentionally initialized once. Realtime refreshes must not overwrite
  // fields while an administrator is editing them.
  const [fields, setFields] = useState(() => initialFields(statuses, initialValue, defaultProjectTier));
  const [teamTracks, setTeamTracks] = useState(() => initialTeamTracks(statuses, initialValue));
  const [errors, setErrors] = useState<WorkItemFormErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const noun = kind === "project" ? "project" : "subtask";
  const action = initialValue ? `Save ${noun}` : `Create ${noun}`;
  const showDeliveryFields = deliveryFields && !useTeamTracks && scheduleMode === "dates";

  function setField<Key extends keyof WorkItemDraftFields>(
    key: Key,
    value: WorkItemDraftFields[Key],
  ) {
    setFields((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  }

  function updateTeamTrack(key: string, patch: Partial<TeamTrackDraft>) {
    setTeamTracks((current) =>
      current.map((track) => (track.key === key ? { ...track, ...patch } : track)));
    setErrors((current) => {
      if (!current.teamTrackFields?.[key] && !current.teamTracks) return current;
      const nextFieldErrors = { ...current.teamTrackFields };
      delete nextFieldErrors[key];
      return {
        ...current,
        teamTracks: undefined,
        teamTrackFields: Object.keys(nextFieldErrors).length ? nextFieldErrors : undefined,
      };
    });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submittingRef.current) return;
    const nextErrors = validateWorkItemDraft(fields, scheduleMode, {
      requireProgress: showProgress,
      requireTeamTracks: useTeamTracks,
      teamTracks: useTeamTracks ? teamTracks : undefined,
      deliveryFields: showDeliveryFields,
    });
    setErrors(nextErrors);
    setSubmitError(null);
    if (Object.keys(nextErrors).length) return;

    const normalizedTracks = useTeamTracks
      ? teamTracks.map((track) => ({
          teamName: track.teamName.trim(),
          statusId: track.statusId,
          startDate: track.startDate || null,
          endDate: track.endDate || null,
        }))
      : undefined;
    const primaryStatusId = normalizedTracks?.[0]?.statusId || fields.statusId;

    submittingRef.current = true;
    setSubmitting(true);
    try {
      await onSubmit({
        title: fields.title.trim(),
        description: fields.description.trim(),
        statusId: primaryStatusId,
        priority: fields.priority,
        progress: showProgress ? Number(fields.progress) : Number(fields.progress || 0),
        startDate: useTeamTracks
          ? null
          : scheduleMode === "dates" ? fields.startDate || null : null,
        endDate: useTeamTracks
          ? null
          : scheduleMode === "dates" ? fields.endDate || null : null,
        lastWeekStatus: scheduleMode === "ops-health"
          ? asOpsHealthStatus(fields.lastWeekStatus)
          : null,
        currentStatus: scheduleMode === "ops-health"
          ? asOpsHealthStatus(fields.currentStatus)
          : null,
        assignee: fields.assignee.trim() || null,
        releaseTag: showRelease ? fields.releaseTag.trim() || null : fields.releaseTag.trim() || null,
        ...(normalizedTracks ? { teamTracks: normalizedTracks } : {}),
        ...(showDeliveryFields
          ? {
              readinessDate: fields.readinessDate || null,
              teamEffortWd: parseWorkingDays(fields.teamEffortWd ?? "") ?? null,
              timeToMarketWd: parseWorkingDays(fields.timeToMarketWd ?? "") ?? null,
            }
          : {}),
        ...(showProjectTier ? { projectTier: fields.projectTier ?? "standard" } : {}),
      });
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Unable to save this work item.");
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  return (
    <form className="work-item-form" onSubmit={handleSubmit} noValidate>
      <div className="form-field">
        <label htmlFor="work-item-title">Title</label>
        <input
          id="work-item-title"
          value={fields.title}
          maxLength={200}
          onChange={(event) => setField("title", event.target.value)}
          aria-invalid={Boolean(errors.title)}
          aria-describedby={errors.title ? "work-item-title-error" : undefined}
          data-modal-initial-focus
        />
        {errors.title ? <p className="form-error" id="work-item-title-error">{errors.title}</p> : null}
      </div>

      {showDescription ? (
        <div className="form-field">
          <label htmlFor="work-item-description">{descriptionLabel}</label>
          <textarea
            id="work-item-description"
            value={fields.description}
            maxLength={10_000}
            onChange={(event) => setField("description", event.target.value)}
            aria-invalid={Boolean(errors.description)}
            aria-describedby={errors.description ? "work-item-description-error" : undefined}
            rows={4}
          />
          {errors.description ? (
            <p className="form-error" id="work-item-description-error">{errors.description}</p>
          ) : null}
        </div>
      ) : null}

      {!useTeamTracks ? (
        <div className="form-row">
          <div className="form-field">
            <label htmlFor="work-item-status">Status</label>
            <select
              id="work-item-status"
              value={fields.statusId}
              onChange={(event) => setField("statusId", event.target.value)}
              aria-invalid={Boolean(errors.statusId)}
              aria-describedby={errors.statusId ? "work-item-status-error" : undefined}
            >
              {!statuses.length ? <option value="">No statuses available</option> : null}
              {statuses.map((status) => (
                <option key={status.id} value={status.id}>{status.name}</option>
              ))}
            </select>
            {errors.statusId ? <p className="form-error" id="work-item-status-error">{errors.statusId}</p> : null}
          </div>
          <div className="form-field">
            <label htmlFor="work-item-priority">Priority</label>
            <select
              id="work-item-priority"
              value={fields.priority}
              onChange={(event) => setField("priority", event.target.value as ProjectPriority)}
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </div>
        </div>
      ) : (
        <div className="form-field">
          <label htmlFor="work-item-priority">Priority</label>
          <select
            id="work-item-priority"
            value={fields.priority}
            onChange={(event) => setField("priority", event.target.value as ProjectPriority)}
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        </div>
      )}

      {showProjectTier ? (
        <div className="form-field">
          <label htmlFor="work-item-project-tier">Project type</label>
          <select
            id="work-item-project-tier"
            value={fields.projectTier ?? "standard"}
            onChange={(event) =>
              setField("projectTier", event.target.value === "critical" ? "critical" : "standard")}
          >
            <option value="standard">Standard project</option>
            <option value="critical">Critical project</option>
          </select>
        </div>
      ) : null}

      {showProgress ? (
        <div className="form-field">
          <label htmlFor="work-item-progress">Progress</label>
          <input
            id="work-item-progress"
            type="number"
            min="0"
            max="100"
            step="1"
            value={fields.progress}
            onChange={(event) => setField("progress", event.target.value)}
            aria-invalid={Boolean(errors.progress)}
            aria-describedby={errors.progress ? "work-item-progress-error" : undefined}
          />
          {errors.progress ? <p className="form-error" id="work-item-progress-error">{errors.progress}</p> : null}
        </div>
      ) : null}

      {useTeamTracks ? (
        <section className="team-tracks-editor" aria-label="Team schedules">
          <div className="team-tracks-editor-heading">
            <h3>Teams</h3>
            <button
              type="button"
              className="secondary-button"
              onClick={() => setTeamTracks((current) => [
                ...current,
                {
                  key: newTrackKey(),
                  teamName: "",
                  statusId: statuses[0]?.id ?? "",
                  startDate: "",
                  endDate: "",
                },
              ])}
            >
              Add team
            </button>
          </div>
          {errors.teamTracks ? (
            <p className="form-error" role="alert">{errors.teamTracks}</p>
          ) : null}
          {teamTracks.map((track, index) => {
            const trackErrors = errors.teamTrackFields?.[track.key];
            return (
              <div className="team-track-card" key={track.key}>
                <div className="team-track-card-heading">
                  <p>Team {index + 1}</p>
                  {teamTracks.length > 1 ? (
                    <button
                      type="button"
                      className="delete-button"
                      aria-label={`Remove team ${index + 1}`}
                      onClick={() => setTeamTracks((current) =>
                        current.filter((candidate) => candidate.key !== track.key))}
                    >
                      x
                    </button>
                  ) : null}
                </div>
                <div className="form-field">
                  <label htmlFor={`work-item-team-name-${track.key}`}>Team name</label>
                  <input
                    id={`work-item-team-name-${track.key}`}
                    value={track.teamName}
                    maxLength={100}
                    placeholder="e.g. Data Lake, Analytics"
                    onChange={(event) => updateTeamTrack(track.key, { teamName: event.target.value })}
                    aria-invalid={Boolean(trackErrors?.teamName)}
                  />
                  {trackErrors?.teamName ? (
                    <p className="form-error">{trackErrors.teamName}</p>
                  ) : null}
                </div>
                <div className="form-field">
                  <label htmlFor={`work-item-team-status-${track.key}`}>
                    {teamFieldLabel(track.teamName, "Status")}
                  </label>
                  <select
                    id={`work-item-team-status-${track.key}`}
                    value={track.statusId}
                    onChange={(event) => updateTeamTrack(track.key, { statusId: event.target.value })}
                    aria-invalid={Boolean(trackErrors?.statusId)}
                  >
                    {!statuses.length ? <option value="">No statuses available</option> : null}
                    {statuses.map((status) => (
                      <option key={status.id} value={status.id}>{status.name}</option>
                    ))}
                  </select>
                  {trackErrors?.statusId ? (
                    <p className="form-error">{trackErrors.statusId}</p>
                  ) : null}
                </div>
                <div className="form-row">
                  <div className="form-field">
                    <label htmlFor={`work-item-team-start-${track.key}`}>
                      {teamFieldLabel(track.teamName, "Start Date")}
                    </label>
                    <input
                      id={`work-item-team-start-${track.key}`}
                      type="date"
                      value={track.startDate}
                      onChange={(event) => updateTeamTrack(track.key, { startDate: event.target.value })}
                    />
                  </div>
                  <div className="form-field">
                    <label htmlFor={`work-item-team-end-${track.key}`}>
                      {teamFieldLabel(track.teamName, "End Date")}
                    </label>
                    <input
                      id={`work-item-team-end-${track.key}`}
                      type="date"
                      value={track.endDate}
                      onChange={(event) => updateTeamTrack(track.key, { endDate: event.target.value })}
                      aria-invalid={Boolean(trackErrors?.endDate)}
                    />
                    {trackErrors?.endDate ? (
                      <p className="form-error">{trackErrors.endDate}</p>
                    ) : null}
                  </div>
                </div>
              </div>
            );
          })}
        </section>
      ) : scheduleMode === "ops-health" ? (
        <div className="form-row">
          <div className="form-field">
            <label htmlFor="work-item-last-week-status">Last Week Status</label>
            <select
              id="work-item-last-week-status"
              value={fields.lastWeekStatus}
              onChange={(event) => setField("lastWeekStatus", event.target.value)}
              aria-invalid={Boolean(errors.lastWeekStatus)}
              aria-describedby={errors.lastWeekStatus ? "work-item-last-week-status-error" : undefined}
            >
              <option value="">Not set</option>
              {OPS_HEALTH_OPTIONS.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
            {errors.lastWeekStatus ? (
              <p className="form-error" id="work-item-last-week-status-error">
                {errors.lastWeekStatus}
              </p>
            ) : null}
          </div>
          <div className="form-field">
            <label htmlFor="work-item-current-status">Current Status</label>
            <select
              id="work-item-current-status"
              value={fields.currentStatus}
              onChange={(event) => setField("currentStatus", event.target.value)}
              aria-invalid={Boolean(errors.currentStatus)}
              aria-describedby={errors.currentStatus ? "work-item-current-status-error" : undefined}
            >
              <option value="">Not set</option>
              {OPS_HEALTH_OPTIONS.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
            {errors.currentStatus ? (
              <p className="form-error" id="work-item-current-status-error">
                {errors.currentStatus}
              </p>
            ) : null}
          </div>
        </div>
      ) : (
        <>
          <div className="form-row">
            <div className="form-field">
              <label htmlFor="work-item-start">{startDateLabel}</label>
              <input
                id="work-item-start"
                type="date"
                value={fields.startDate}
                onChange={(event) => setField("startDate", event.target.value)}
              />
            </div>
            <div className="form-field">
              <label htmlFor="work-item-end">{endDateLabel}</label>
              <input
                id="work-item-end"
                type="date"
                value={fields.endDate}
                onChange={(event) => setField("endDate", event.target.value)}
                aria-invalid={Boolean(errors.endDate)}
                aria-describedby={errors.endDate ? "work-item-end-error" : undefined}
              />
              {errors.endDate ? <p className="form-error" id="work-item-end-error">{errors.endDate}</p> : null}
            </div>
          </div>
          {showDeliveryFields ? (
            <>
              <div className="form-field">
                <label htmlFor="work-item-readiness">Readiness Date</label>
                <input
                  id="work-item-readiness"
                  type="date"
                  value={fields.readinessDate ?? ""}
                  onChange={(event) => setField("readinessDate", event.target.value)}
                  aria-invalid={Boolean(errors.readinessDate)}
                  aria-describedby={errors.readinessDate ? "work-item-readiness-error" : undefined}
                />
                {errors.readinessDate ? (
                  <p className="form-error" id="work-item-readiness-error">{errors.readinessDate}</p>
                ) : null}
              </div>
              <div className="form-row">
                <div className="form-field">
                  <label htmlFor="work-item-team-effort">Team Efforts (WDs)</label>
                  <input
                    id="work-item-team-effort"
                    type="number"
                    min="0"
                    max="9999.9"
                    step="0.1"
                    inputMode="decimal"
                    value={fields.teamEffortWd ?? ""}
                    onChange={(event) => setField("teamEffortWd", event.target.value)}
                    aria-invalid={Boolean(errors.teamEffortWd)}
                    aria-describedby={errors.teamEffortWd ? "work-item-team-effort-error" : undefined}
                  />
                  {errors.teamEffortWd ? (
                    <p className="form-error" id="work-item-team-effort-error">{errors.teamEffortWd}</p>
                  ) : null}
                </div>
                <div className="form-field">
                  <label htmlFor="work-item-time-to-market">Time to market efforts (WDs)</label>
                  <input
                    id="work-item-time-to-market"
                    type="number"
                    min="0"
                    max="9999.9"
                    step="0.1"
                    inputMode="decimal"
                    value={fields.timeToMarketWd ?? ""}
                    onChange={(event) => setField("timeToMarketWd", event.target.value)}
                    aria-invalid={Boolean(errors.timeToMarketWd)}
                    aria-describedby={errors.timeToMarketWd ? "work-item-time-to-market-error" : undefined}
                  />
                  {errors.timeToMarketWd ? (
                    <p className="form-error" id="work-item-time-to-market-error">{errors.timeToMarketWd}</p>
                  ) : null}
                </div>
              </div>
            </>
          ) : null}
        </>
      )}

      <div className="form-field">
        <label htmlFor="work-item-assignee">{assigneeLabel}</label>
        <input
          id="work-item-assignee"
          value={fields.assignee}
          maxLength={200}
          onChange={(event) => setField("assignee", event.target.value)}
          aria-invalid={Boolean(errors.assignee)}
          aria-describedby={errors.assignee ? "work-item-assignee-error" : undefined}
        />
        {errors.assignee ? (
          <p className="form-error" id="work-item-assignee-error">{errors.assignee}</p>
        ) : null}
      </div>

      {showRelease ? (
        <div className="form-field">
          <label htmlFor="work-item-release">Release</label>
          <input
            id="work-item-release"
            value={fields.releaseTag}
            maxLength={100}
            onChange={(event) => setField("releaseTag", event.target.value)}
            aria-invalid={Boolean(errors.releaseTag)}
            aria-describedby={errors.releaseTag ? "work-item-release-error" : undefined}
            placeholder="e.g. R12, Q3 launch"
          />
          {errors.releaseTag ? (
            <p className="form-error" id="work-item-release-error">{errors.releaseTag}</p>
          ) : null}
        </div>
      ) : null}

      {submitError ? <p className="form-error" role="alert">{submitError}</p> : null}
      <div className="form-actions">
        <button type="button" className="secondary-button" onClick={onCancel} disabled={submitting}>
          Cancel
        </button>
        <button type="submit" className="primary-button" disabled={submitting}>
          {submitting ? "Saving" : action}
        </button>
      </div>
    </form>
  );
}
