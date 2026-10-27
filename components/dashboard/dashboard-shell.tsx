"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
} from "react";
import { useWorkspaceRealtime } from "@/hooks/use-workspace-realtime";
import type { DashboardSource } from "@/lib/data/initial-dashboard";
import {
  aggregateKpis,
  projectMatchesStatusFilter,
  projectTierOf,
  type DashboardComment,
  type DashboardProject,
  type DashboardViewModel,
  type DashboardWorkItem,
  type ProjectTier,
} from "@/lib/data/dashboard";
import {
  allFilterLabel,
  isDigitalStyleWorkspace,
  isPeDeliveryWorkspace,
  usesActionOwner,
  usesTeamTracks,
} from "@/lib/dashboard/workspace-style";
import {
  WorkItemForm,
  type WorkItemFormValue,
} from "@/components/admin/work-item-form";
import { StatusManager } from "@/components/admin/statuses/status-manager";
import {
  buildWorkItemPayload,
  createWorkItem,
  deleteWorkItem,
  reorderWorkItems,
  replaceWorkItemTeamTracks,
  updateWorkItem,
  WORK_ITEM_CONFLICT_CODE,
  WorkItemMutationError,
} from "@/lib/data/work-item-mutations";
import {
  createComment,
  deleteComment,
  updateComment,
  type CommentInput,
} from "@/lib/data/comment-mutations";
import { createClient } from "@/lib/supabase/client";
import { WorkspaceSwitcher } from "@/components/layout/workspace-switcher";
import { SessionControls } from "@/components/auth/session-controls";
import { BrandMark } from "@/components/ui/brand-mark";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/view-states";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ModalDialog } from "@/components/ui/modal-dialog";
import { KpiGrid } from "./kpi-grid";
import { LiveVariantFilterControl, type LiveVariantFilter } from "./live-variant-filter";
import { PeDeliveryNotes } from "./pe-delivery-notes";
import { ProjectCard } from "./project-card";
import { ProjectDetailsModal } from "./project-details-modal";
import { ProjectTierToggle } from "./project-tier-toggle";
import { WorkspaceTag } from "./workspace-tag";
import { updateWorkspaceTag } from "@/lib/data/workspace-mutations";
import { StatusFilters, type StatusFilter } from "./status-filters";

interface DashboardShellProps {
  initialDashboard: DashboardViewModel;
  source: DashboardSource;
  isAdmin?: boolean;
  adminEmail?: string;
  viewState?: "ready" | "loading" | "error";
}

interface EditorState {
  kind: "project" | "subtask";
  parentId: string | null;
  item?: DashboardWorkItem;
}

type RetryIntent =
  | {
      kind: "create";
      itemId: string;
      parentId: string | null;
      value: WorkItemFormValue;
    }
  | {
      kind: "update";
      itemId: string;
      parentId: string | null;
      expectedUpdatedAt: string;
      value: WorkItemFormValue;
    }
  | {
      kind: "delete";
      itemId: string;
      parentId: string | null;
      expectedUpdatedAt: string;
    }
  | {
      kind: "reorder";
      itemId: string;
      parentId: string | null;
      beforeId: string | null;
    };

interface PendingDelete {
  items: Array<{
    item: DashboardWorkItem;
    parentId: string | null;
  }>;
}

interface OptimisticOperation {
  apply: (current: DashboardViewModel) => DashboardViewModel;
  execute: () => Promise<unknown>;
  retryIntent: RetryIntent;
}

const connectionLabels = {
  connecting: "Connecting",
  live: "Live",
  disconnected: "Disconnected — showing last known data",
  reconnecting: "Reconnecting — showing last known data",
  error: "Refresh error — showing last known data",
} as const;

function withProjects(
  dashboard: DashboardViewModel,
  projects: DashboardProject[],
): DashboardViewModel {
  return { ...dashboard, projects, kpis: aggregateKpis(projects) };
}

function optimisticItem(
  id: string,
  value: WorkItemFormValue,
  dashboard: DashboardViewModel,
  sortOrder: number,
  comments: DashboardWorkItem["comments"] = [],
  updatedAt = "",
): DashboardWorkItem {
  const status = dashboard.statuses.find((candidate) => candidate.id === value.statusId);
  if (!status) throw new Error("The selected status no longer exists.");
  const legacyStatus = {
    active: "in-progress",
    risk: "at-risk",
    delayed: "delayed",
    completed: "completed",
  }[status.reportingCategory] as DashboardWorkItem["status"];
  const teamTracks = value.teamTracks?.map((track, index) => {
    const trackStatus = dashboard.statuses.find((candidate) => candidate.id === track.statusId);
    if (!trackStatus) throw new Error("A team status no longer exists.");
    return {
      id: `optimistic-track-${id}-${index}`,
      teamName: track.teamName,
      statusId: trackStatus.id,
      statusName: trackStatus.name,
      statusColor: trackStatus.color,
      ...(track.startDate ? { startDate: track.startDate } : {}),
      ...(track.endDate ? { endDate: track.endDate } : {}),
      sortOrder: index,
    };
  });
  return {
    id,
    title: value.title,
    description: value.description,
    status: legacyStatus,
    statusId: status.id,
    statusName: status.name,
    statusColor: status.color,
    reportingCategory: status.reportingCategory,
    owner: value.assignee ?? "Unassigned",
    priority: value.priority,
    progress: value.progress,
    ...(value.startDate ? { startDate: value.startDate } : {}),
    ...(value.endDate ? { endDate: value.endDate } : {}),
    ...(value.lastWeekStatus ? { lastWeekStatus: value.lastWeekStatus } : {}),
    ...(value.currentStatus ? { currentStatus: value.currentStatus } : {}),
    ...(value.releaseTag ? { releaseTag: value.releaseTag } : {}),
    ...(value.readinessDate ? { readinessDate: value.readinessDate } : {}),
    ...(value.teamEffortWd !== null && value.teamEffortWd !== undefined
      ? { teamEffortWd: value.teamEffortWd }
      : {}),
    ...(value.timeToMarketWd !== null && value.timeToMarketWd !== undefined
      ? { timeToMarketWd: value.timeToMarketWd }
      : {}),
    ...(value.projectTier ? { projectTier: value.projectTier } : {}),
    ...(teamTracks?.length ? { teamTracks } : {}),
    sortOrder,
    updatedAt,
    syncSource: "local",
    comments,
  };
}

function newItemId() {
  return globalThis.crypto?.randomUUID?.()
    ?? `${Date.now().toString(16).padStart(8, "0")}-0000-4000-8000-000000000000`;
}

function findItem(dashboard: DashboardViewModel, itemId: string) {
  for (const project of dashboard.projects) {
    if (project.id === itemId) return project;
    const subtask = project.subtasks.find((item) => item.id === itemId);
    if (subtask) return subtask;
  }
  return null;
}

interface EditorDialogProps {
  editor: EditorState;
  dashboard: DashboardViewModel;
  onSubmit: (value: WorkItemFormValue) => Promise<void>;
  onClose: () => void;
  retryNotice: {
    message: string;
    retry?: () => void;
  } | null;
  defaultProjectTier: ProjectTier;
}

function EditorDialog({
  editor,
  dashboard,
  onSubmit,
  onClose,
  retryNotice,
  defaultProjectTier,
}: EditorDialogProps) {
  const noun = editor.kind === "project" ? "project" : "subtask";
  const title = `${editor.item ? "Edit" : "New"} ${noun}`;
  return (
    <ModalDialog
      labelledBy="work-item-editor-title"
      closeLabel={`Close ${noun} form`}
      onClose={onClose}
      className="admin-modal"
    >
      <p className="eyebrow">Administration</p>
      <h2 id="work-item-editor-title">{title}</h2>
      {retryNotice?.retry ? (
        <div className="mutation-notice" role="alert">
          <span>{retryNotice.message}</span>
          <button type="button" onClick={retryNotice.retry}>Retry</button>
        </div>
      ) : null}
      <WorkItemForm
        kind={editor.kind}
        statuses={dashboard.statuses}
        initialValue={editor.item}
        scheduleMode={
          dashboard.slug === "pe-ops" || dashboard.slug === "datalake-ops"
            ? "ops-health"
            : "dates"
        }
        descriptionLabel={
          dashboard.slug === "datalake-ops" || dashboard.slug === "digital"
            ? "Comments"
            : "Description"
        }
        assigneeLabel={usesActionOwner(dashboard.slug) ? "Action Owner" : "Assignee"}
        startDateLabel={
          dashboard.slug === "digital" || isPeDeliveryWorkspace(dashboard.slug)
            ? "Start Date"
            : "Start date"
        }
        endDateLabel={
          dashboard.slug === "digital"
            ? "RFT Date"
            : isPeDeliveryWorkspace(dashboard.slug) ? "Deployment Date" : "End date"
        }
        deliveryFields={isPeDeliveryWorkspace(dashboard.slug)}
        showProjectTier={isPeDeliveryWorkspace(dashboard.slug) && editor.kind === "project"}
        defaultProjectTier={defaultProjectTier}
        showProgress={!isDigitalStyleWorkspace(dashboard.slug)}
        showRelease={isDigitalStyleWorkspace(dashboard.slug)}
        useTeamTracks={usesTeamTracks(dashboard.slug)}
        onSubmit={onSubmit}
        onCancel={onClose}
      />
    </ModalDialog>
  );
}

export function DashboardShell({
  initialDashboard,
  source,
  isAdmin = false,
  adminEmail,
  viewState = "ready",
}: DashboardShellProps) {
  const realtime = useWorkspaceRealtime(initialDashboard, { enabled: source === "database" });
  const [workspace, setWorkspace] = useState(realtime.data);
  const canAdmin = isAdmin && source === "database" && !workspace.jiraLinked;
  const supabase = useMemo(() => canAdmin ? createClient() : null, [canAdmin]);
  const workspaceRef = useRef(workspace);
  const authoritativeRef = useRef(realtime.data);
  const mutationBusyRef = useRef(false);
  const [activeFilter, setActiveFilter] = useState<StatusFilter>("all");
  const [selectedTier, setSelectedTier] = useState<ProjectTier>("critical");
  const [liveVariant, setLiveVariant] = useState<LiveVariantFilter>("live");
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);
  const [selectedProjectIds, setSelectedProjectIds] = useState<Set<string>>(new Set());
  const [dragProjectId, setDragProjectId] = useState<string | null>(null);
  const [dropTargetProjectId, setDropTargetProjectId] = useState<string | null>(null);
  const [manageKpisOpen, setManageKpisOpen] = useState(false);
  const [mutationNotice, setMutationNotice] = useState<{
    message: string;
    retry?: () => void;
  } | null>(null);
  const closeProject = useCallback(() => setSelectedProjectId(null), []);

  useEffect(() => {
    authoritativeRef.current = realtime.data;
    if (mutationBusyRef.current) return;
    workspaceRef.current = realtime.data;
    setWorkspace(realtime.data);
  }, [realtime.data]);

  const retryIntentRef = useRef<(intent: RetryIntent) => Promise<void>>(
    async () => undefined,
  );
  const commitAuthoritative = useCallback((dashboard: DashboardViewModel) => {
    authoritativeRef.current = dashboard;
    workspaceRef.current = dashboard;
    setWorkspace(dashboard);
  }, []);

  const perform = useCallback(async (operation: OptimisticOperation) => {
    if (mutationBusyRef.current) {
      throw new Error("Another change is still saving. Wait for it to finish.");
    }
    mutationBusyRef.current = true;
    const previous = workspaceRef.current;
    const optimistic = operation.apply(previous);
    workspaceRef.current = optimistic;
    setWorkspace(optimistic);
    setMutationNotice(null);
    let mutationError: unknown = null;
    try {
      await operation.execute();
    } catch (error) {
      mutationError = error;
      // Never roll back to the snapshot captured before the request. Realtime may
      // have delivered a newer authoritative view while the optimistic write ran.
      workspaceRef.current = authoritativeRef.current;
      setWorkspace(authoritativeRef.current);
    }

    let refreshError: unknown = null;
    try {
      const authoritative = await realtime.refetch();
      commitAuthoritative(authoritative);
    } catch (error) {
      refreshError = error;
      commitAuthoritative(authoritativeRef.current);
    } finally {
      mutationBusyRef.current = false;
    }

    if (mutationError) {
      const message = mutationError instanceof Error
        ? mutationError.message
        : "The change could not be saved.";
      const isConflict = mutationError instanceof WorkItemMutationError
        && mutationError.code === WORK_ITEM_CONFLICT_CODE;
      setMutationNotice({
        message,
        ...(!isConflict ? {
          retry: () => {
            setMutationNotice(null);
            void retryIntentRef.current(operation.retryIntent);
          },
        } : {}),
      });
      throw mutationError;
    }

    if (refreshError) {
      const message = refreshError instanceof Error
        ? refreshError.message
        : "The dashboard could not refresh.";
      setMutationNotice({
        message: `Saved, but the dashboard could not refresh: ${message}`,
        retry: () => {
          setMutationNotice(null);
          void realtime.refetch()
            .then(commitAuthoritative)
            .catch((error) => {
              setMutationNotice({
                message: error instanceof Error
                  ? error.message
                  : "The dashboard could not refresh.",
              });
            });
        },
      });
    }
  }, [commitAuthoritative, realtime]);

  const runIntent = useCallback(async (
    intent: RetryIntent,
    base = workspaceRef.current,
  ) => {
    if (!supabase) throw new Error("Administrator access is required.");

    if (intent.kind === "create") {
      const siblings = intent.parentId
        ? base.projects.find((project) => project.id === intent.parentId)?.subtasks
        : base.projects;
      if (!siblings) throw new Error("The selected parent project no longer exists.");
      if (findItem(base, intent.itemId)) return;
      const created = optimisticItem(
        intent.itemId,
        intent.value,
        base,
        siblings.length,
      );
      const payload = buildWorkItemPayload(
        base.id,
        intent.parentId,
        intent.value,
        siblings.length,
        intent.itemId,
      );
      await perform({
        retryIntent: intent,
        apply(dashboard) {
          if (findItem(dashboard, intent.itemId)) return dashboard;
          if (intent.parentId) {
            return withProjects(dashboard, dashboard.projects.map((project) =>
              project.id === intent.parentId
                ? { ...project, subtasks: [...project.subtasks, created] }
                : project));
          }
          return withProjects(dashboard, [...dashboard.projects, { ...created, subtasks: [] }]);
        },
        execute: async () => {
          await createWorkItem(supabase, payload);
          if (intent.value.teamTracks) {
            await replaceWorkItemTeamTracks(supabase, intent.itemId, intent.value.teamTracks);
          }
        },
      });
      return;
    }

    if (intent.kind === "update") {
      const currentItem = findItem(base, intent.itemId);
      if (!currentItem) throw new Error("The work item no longer exists.");
      const updated = optimisticItem(
        intent.itemId,
        intent.value,
        base,
        currentItem.sortOrder,
        currentItem.comments,
        currentItem.updatedAt,
      );
      await perform({
        retryIntent: intent,
        apply(dashboard) {
          return withProjects(dashboard, dashboard.projects.map((project) => {
            if (project.id === intent.itemId) return { ...project, ...updated };
            if (project.id !== intent.parentId) return project;
            return {
              ...project,
              subtasks: project.subtasks.map((subtask) =>
                subtask.id === intent.itemId ? updated : subtask),
            };
          }));
        },
        execute: async () => {
          await updateWorkItem(
            supabase,
            base.id,
            intent.itemId,
            intent.expectedUpdatedAt,
            intent.value,
          );
          if (intent.value.teamTracks) {
            await replaceWorkItemTeamTracks(supabase, intent.itemId, intent.value.teamTracks);
          }
        },
      });
      return;
    }

    if (intent.kind === "delete") {
      if (!findItem(base, intent.itemId)) return;
      await perform({
        retryIntent: intent,
        apply(dashboard) {
          return intent.parentId
            ? withProjects(dashboard, dashboard.projects.map((project) =>
                project.id === intent.parentId
                  ? {
                      ...project,
                      subtasks: project.subtasks.filter(
                        (subtask) => subtask.id !== intent.itemId,
                      ),
                    }
                  : project))
            : withProjects(
                dashboard,
                dashboard.projects.filter((project) => project.id !== intent.itemId),
              );
        },
        execute: () => deleteWorkItem(
          supabase,
          base.id,
          intent.itemId,
          intent.expectedUpdatedAt,
        ),
      });
      return;
    }

    const siblings = intent.parentId
      ? base.projects.find((project) => project.id === intent.parentId)?.subtasks
      : base.projects;
    if (!siblings) throw new Error("The sibling list no longer exists.");
    const moving = siblings.find((item) => item.id === intent.itemId);
    if (!moving) return;
    if (intent.beforeId === intent.itemId) return;
    const without = siblings.filter((item) => item.id !== intent.itemId);
    let reordered: typeof siblings;
    if (intent.beforeId == null) {
      reordered = [...without, moving];
    } else {
      const beforeIndex = without.findIndex((item) => item.id === intent.beforeId);
      if (beforeIndex < 0) return;
      reordered = [
        ...without.slice(0, beforeIndex),
        moving,
        ...without.slice(beforeIndex),
      ];
    }
    if (reordered.every((item, index) => item.id === siblings[index]?.id)) return;
    const normalized = reordered.map((item, sortOrder) => ({ ...item, sortOrder }));
    const orderedIds = normalized.map((item) => item.id);
    await perform({
      retryIntent: intent,
      apply(dashboard) {
        return intent.parentId
          ? withProjects(dashboard, dashboard.projects.map((project) =>
              project.id === intent.parentId ? { ...project, subtasks: normalized } : project))
          : withProjects(dashboard, normalized as DashboardProject[]);
      },
      execute: () => reorderWorkItems(supabase, base.id, intent.parentId, orderedIds),
    });
  }, [perform, supabase]);

  const retryIntent = useCallback(async (intent: RetryIntent) => {
    try {
      const authoritative = await realtime.refetch();
      commitAuthoritative(authoritative);
      if (intent.kind === "create" && findItem(authoritative, intent.itemId)) {
        setMutationNotice(null);
        setEditor(null);
        return;
      }
      if (intent.kind === "delete" && !findItem(authoritative, intent.itemId)) {
        setMutationNotice(null);
        return;
      }
      await runIntent(intent, authoritative);
      setMutationNotice(null);
      if (intent.kind === "create" || intent.kind === "update") setEditor(null);
    } catch (error) {
      if (mutationBusyRef.current) return;
      setMutationNotice({
        message: error instanceof Error ? error.message : "Retry failed.",
        retry: () => void retryIntentRef.current(intent),
      });
    }
  }, [commitAuthoritative, realtime, runIntent]);

  useEffect(() => {
    retryIntentRef.current = retryIntent;
  }, [retryIntent]);

  const submitEditor = useCallback(async (value: WorkItemFormValue) => {
    if (!editor || !supabase) throw new Error("Administrator access is required.");
    try {
      await runIntent(editor.item ? {
        kind: "update",
        itemId: editor.item.id,
        parentId: editor.parentId,
        expectedUpdatedAt: editor.item.updatedAt,
        value,
      } : {
        kind: "create",
        itemId: newItemId(),
        parentId: editor.parentId,
        value,
      });
      setEditor(null);
    } catch (error) {
      if (error instanceof WorkItemMutationError && error.code === WORK_ITEM_CONFLICT_CODE) {
        setEditor(null);
      }
      throw error;
    }
  }, [editor, runIntent, supabase]);

  const requestRemoveItem = useCallback((item: DashboardWorkItem, parentId: string | null) => {
    if (!supabase) return;
    setPendingDelete({ items: [{ item, parentId }] });
  }, [supabase]);

  const requestRemoveSelectedProjects = useCallback(() => {
    if (!supabase || !selectedProjectIds.size) return;
    const items = workspace.projects
      .filter((project) => selectedProjectIds.has(project.id))
      .map((item) => ({ item, parentId: null as string | null }));
    if (!items.length) return;
    setPendingDelete({ items });
  }, [selectedProjectIds, supabase, workspace.projects]);

  const confirmPendingDelete = useCallback(async () => {
    if (!pendingDelete || !supabase) return;
    const items = pendingDelete.items;
    setPendingDelete(null);
    for (const entry of items) {
      const current = findItem(workspaceRef.current, entry.item.id);
      if (!current) continue;
      try {
        await runIntent({
          kind: "delete",
          itemId: current.id,
          parentId: entry.parentId,
          expectedUpdatedAt: current.updatedAt,
        });
      } catch {
        // Notice + retry are handled by perform/runIntent.
        break;
      }
    }
    setSelectedProjectIds((current) => {
      const removed = new Set(items.map((entry) => entry.item.id));
      const next = new Set<string>();
      current.forEach((id) => {
        if (!removed.has(id)) next.add(id);
      });
      return next;
    });
  }, [pendingDelete, runIntent, supabase]);

  const reorderItem = useCallback((
    itemId: string,
    parentId: string | null,
    beforeId: string | null,
  ) => {
    if (!supabase) return;
    void runIntent({
      kind: "reorder",
      itemId,
      parentId,
      beforeId,
    }).catch(() => undefined);
  }, [runIntent, supabase]);

  const handleProjectDragStart = useCallback((
    projectId: string,
    event: DragEvent<HTMLElement>,
  ) => {
    setDragProjectId(projectId);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", projectId);
  }, []);

  const handleProjectDragOver = useCallback((
    projectId: string,
    event: DragEvent<HTMLElement>,
  ) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setDropTargetProjectId(projectId);
  }, []);

  const handleProjectDrop = useCallback((
    beforeId: string,
    event: DragEvent<HTMLElement>,
  ) => {
    event.preventDefault();
    const sourceId = event.dataTransfer.getData("text/plain") || dragProjectId;
    setDropTargetProjectId(null);
    setDragProjectId(null);
    if (!sourceId || sourceId === beforeId) return;
    reorderItem(sourceId, null, beforeId);
  }, [dragProjectId, reorderItem]);

  const handleProjectDragEnd = useCallback(() => {
    setDragProjectId(null);
    setDropTargetProjectId(null);
  }, []);

  const mapComment = useCallback((row: {
    id: string;
    author_name: string;
    body: string;
    created_at: string;
    updated_at: string;
  }): DashboardComment => ({
    id: row.id,
    author: row.author_name,
    text: row.body,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }), []);

  const commentControls = canAdmin && supabase ? {
    onCreate: async (itemId: string, id: string, input: CommentInput) => {
      if (!findItem(workspaceRef.current, itemId)) {
        throw new Error("The work item no longer exists in this workspace.");
      }
      const row = await createComment(supabase, itemId, input, id);
      return mapComment(row);
    },
    onUpdate: async (
      itemId: string,
      comment: DashboardComment,
      input: CommentInput,
    ) => {
      if (!findItem(workspaceRef.current, itemId)) {
        throw new Error("The work item no longer exists in this workspace.");
      }
      const row = await updateComment(
        supabase,
        itemId,
        comment.id,
        comment.updatedAt,
        input,
      );
      return mapComment(row);
    },
    onDelete: async (itemId: string, comment: DashboardComment) => {
      if (!findItem(workspaceRef.current, itemId)) {
        throw new Error("The work item no longer exists in this workspace.");
      }
      await deleteComment(supabase, itemId, comment.id, comment.updatedAt);
    },
    onRefresh: async (itemId: string) => {
      const authoritative = await realtime.refetch();
      commitAuthoritative(authoritative);
      const item = findItem(authoritative, itemId);
      return item?.comments ?? [];
    },
  } : undefined;

  const selectedProject = useMemo(
    () => workspace.projects.find((project) => project.id === selectedProjectId) ?? null,
    [selectedProjectId, workspace.projects],
  );
  const effectiveFilter =
    activeFilter === "all" || workspace.statuses.some((status) => status.id === activeFilter)
      ? activeFilter
      : "all";
  const usesProjectTiers = isPeDeliveryWorkspace(workspace.slug);
  const effectiveTier = usesProjectTiers ? selectedTier : "all";
  const tierProjects = useMemo(
    () => effectiveTier === "all"
      ? workspace.projects
      : workspace.projects.filter((project) => projectTierOf(project) === effectiveTier),
    [effectiveTier, workspace.projects],
  );

  function selectTierKpi(filter: StatusFilter) {
    setActiveFilter(effectiveFilter === filter ? "all" : filter);
  }

  const saveWorkspaceTag = supabase
    ? async (tag: string | null) => {
        await updateWorkspaceTag(supabase, workspace.id, tag);
        commitAuthoritative(await realtime.refetch());
      }
    : undefined;

  const liveStatus = useMemo(
    () => workspace.statuses.find((status) => status.name.trim().toLowerCase() === "live"),
    [workspace.statuses],
  );
  const isPeLiveFilter =
    workspace.slug === "pe-development"
    && Boolean(liveStatus)
    && effectiveFilter === liveStatus?.id;

  const visibleProjects = useMemo(() => {
    const byStatus = effectiveFilter === "all"
      ? tierProjects
      : tierProjects.filter((project) =>
          projectMatchesStatusFilter(project, effectiveFilter));

    if (!isPeLiveFilter || !liveStatus) return byStatus;

    return byStatus.filter((project) => {
      const hasNonLiveChild = project.subtasks.some(
        (child) => child.statusId !== liveStatus.id,
      );
      return liveVariant === "live-with-crs" ? hasNonLiveChild : !hasNonLiveChild;
    });
  }, [
    effectiveFilter,
    isPeLiveFilter,
    liveStatus,
    liveVariant,
    tierProjects,
  ]);

  return (
    <>
      <main className="dashboard">
        <header className="dashboard-header">
          <div className="brand-lockup">
            <p className="eyebrow">Delivery workspace</p>
            <div className="brand-title-row">
              <BrandMark />
              <h1>{workspace.name}</h1>
            </div>
            <p className="workspace-description">{workspace.description}</p>
          </div>
          <div className="header-tools">
            {isAdmin && source === "database" ? (
              <div className="header-admin">
                {canAdmin ? (
                  <>
                    <Link
                      className="secondary-button settings-link"
                      href={`/${workspace.slug}/history`}
                    >
                      History
                    </Link>
                    <button
                      className="secondary-button settings-link"
                      type="button"
                      onClick={() => setManageKpisOpen(true)}
                    >
                      Manage KPIs
                    </button>
                    <Link
                      className="secondary-button settings-link"
                      href={`/${workspace.slug}/settings/statuses`}
                    >
                      Status Settings
                    </Link>
                  </>
                ) : null}
                {adminEmail ? (
                  <SessionControls email={adminEmail} returnTo={`/${workspace.slug}`} />
                ) : null}
              </div>
            ) : null}
            <WorkspaceSwitcher activeSlug={workspace.slug} />
            <div
              className="live-indicator"
              data-connection={realtime.fixture ? "fixture" : realtime.connection}
              role="status"
              aria-live="polite"
            >
              <span aria-hidden="true" />
              {realtime.fixture ? "Local/test fixture" : connectionLabels[realtime.connection]}
            </div>
          </div>
        </header>

        {usesProjectTiers ? (
          <KpiGrid
            header={
              <>
                <ProjectTierToggle value={selectedTier} onChange={setSelectedTier} />
                <WorkspaceTag value={workspace.tagLabel} onSave={saveWorkspaceTag} />
              </>
            }
            statuses={workspace.statuses}
            projects={tierProjects}
            activeFilter={effectiveFilter}
            onSelect={selectTierKpi}
            allLabel={allFilterLabel(workspace.slug)}
          />
        ) : (
          <KpiGrid
            statuses={workspace.statuses}
            projects={workspace.projects}
            activeFilter={effectiveFilter}
            onSelect={setActiveFilter}
            allLabel={allFilterLabel(workspace.slug)}
          />
        )}

        {isPeDeliveryWorkspace(workspace.slug) ? <PeDeliveryNotes /> : null}

        {isPeLiveFilter ? (
          <LiveVariantFilterControl value={liveVariant} onChange={setLiveVariant} />
        ) : null}

        <section className="projects-section" aria-labelledby="projects-title">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Portfolio</p>
              <h2 id="projects-title">Projects</h2>
            </div>
            <div className="section-actions">
              <p>{visibleProjects.length} visible</p>
              {canAdmin && selectedProjectIds.size ? (
                <>
                  <p>{selectedProjectIds.size} selected</p>
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={() => setSelectedProjectIds(new Set())}
                  >
                    Clear selection
                  </button>
                  <button
                    className="primary-button delete-confirm-button"
                    type="button"
                    onClick={requestRemoveSelectedProjects}
                  >
                    Delete selected
                  </button>
                </>
              ) : null}
              {canAdmin ? (
                <button
                  className="primary-button"
                  type="button"
                  onClick={() => setEditor({ kind: "project", parentId: null })}
                >
                  New Project
                </button>
              ) : null}
            </div>
          </div>
          {realtime.error ? (
            <p className="realtime-warning" role="alert">
              {realtime.error}. Displayed data may be stale.
            </p>
          ) : null}
          {mutationNotice ? (
            <div className="mutation-notice" role="alert">
              <span>{mutationNotice.message}</span>
              {mutationNotice.retry ? (
                <button type="button" onClick={mutationNotice.retry}>Retry</button>
              ) : null}
              <button
                type="button"
                aria-label="Dismiss error"
                onClick={() => setMutationNotice(null)}
              >
                x
              </button>
            </div>
          ) : null}
          {viewState === "ready" ? (
            <>
              <StatusFilters
                activeFilter={effectiveFilter}
                statuses={workspace.statuses}
                onChange={setActiveFilter}
                allLabel={allFilterLabel(workspace.slug)}
              />
              {visibleProjects.length ? (
                <div className="projects-grid">
                  {visibleProjects.map((project) => (
                    <ProjectCard
                      project={project}
                      key={project.id}
                      showOwner={
                        usesActionOwner(workspace.slug)
                        || (
                          workspace.slug !== "development-operations"
                          && workspace.slug !== "platforms-development"
                          && workspace.slug !== "pe-delivery"
                          && workspace.slug !== "pe-ops"
                          && workspace.slug !== "datalake-ops"
                        )
                      }
                      ownerRoleLabel={
                        usesActionOwner(workspace.slug)
                          ? "Action Owner"
                          : "Project owner"
                      }
                      showProgress={
                        workspace.slug !== "hot-topics"
                        && workspace.slug !== "development-operations"
                        && workspace.slug !== "platforms-development"
                        && workspace.slug !== "pe-delivery"
                        && workspace.slug !== "pe-ops"
                        && workspace.slug !== "datalake-ops"
                        && !isDigitalStyleWorkspace(workspace.slug)
                      }
                      showDescription={
                        workspace.slug === "hot-topics"
                        || workspace.slug === "pe-ops"
                        || workspace.slug === "datalake-ops"
                        || isDigitalStyleWorkspace(workspace.slug)
                      }
                      descriptionLabel={
                        workspace.slug === "datalake-ops" || workspace.slug === "digital"
                          ? "Comments"
                          : "Description"
                      }
                      showDetailsButton={
                        (
                          workspace.slug === "development-operations"
                          || workspace.slug === "platforms-development"
                          || workspace.slug === "pe-delivery"
                          || workspace.slug === "pe-ops"
                          || workspace.slug === "datalake-ops"
                          || isDigitalStyleWorkspace(workspace.slug)
                        )
                          ? false
                          : workspace.slug !== "hot-topics" || canAdmin
                      }
                      openOnCardClick={
                        workspace.slug === "development-operations"
                        || workspace.slug === "platforms-development"
                        || workspace.slug === "pe-delivery"
                        || workspace.slug === "pe-ops"
                        || workspace.slug === "datalake-ops"
                        || isDigitalStyleWorkspace(workspace.slug)
                      }
                      scheduleMode={
                        workspace.slug === "pe-ops" || workspace.slug === "datalake-ops"
                          ? "ops-health"
                          : isPeDeliveryWorkspace(workspace.slug) ? "delivery" : "dates"
                      }
                      startDateLabel={workspace.slug === "digital" ? "Start Date" : "Start"}
                      endDateLabel={workspace.slug === "digital" ? "RFT Date" : "Target"}
                      showReleaseTag={isDigitalStyleWorkspace(workspace.slug)}
                      showOverdueTag={workspace.slug === "development-operations"}
                      showChildHierarchy={workspace.jiraLinked}
                      onOpen={(selected) => setSelectedProjectId(selected.id)}
                      selected={selectedProjectIds.has(project.id)}
                      onSelectedChange={canAdmin ? (selected) => {
                        setSelectedProjectIds((current) => {
                          const next = new Set(current);
                          if (selected) next.add(project.id);
                          else next.delete(project.id);
                          return next;
                        });
                      } : undefined}
                      dragControls={canAdmin ? {
                        onDragStart: (event) => handleProjectDragStart(project.id, event),
                        onDragOver: (event) => handleProjectDragOver(project.id, event),
                        onDragLeave: () => {
                          setDropTargetProjectId((current) =>
                            current === project.id ? null : current);
                        },
                        onDrop: (event) => handleProjectDrop(project.id, event),
                        onDragEnd: handleProjectDragEnd,
                        isDragging: dragProjectId === project.id,
                        isDropTarget: dropTargetProjectId === project.id,
                      } : undefined}
                      adminControls={canAdmin ? {
                        onEdit: () => setEditor({
                          kind: "project",
                          parentId: null,
                          item: project,
                        }),
                        onDelete: () => requestRemoveItem(project, null),
                      } : undefined}
                    />
                  ))}
                </div>
              ) : (
                <EmptyState />
              )}
            </>
          ) : viewState === "loading" ? (
            <LoadingState />
          ) : (
            <ErrorState />
          )}
        </section>

        <footer>
          <p>Focused delivery, clearly presented.</p>
        </footer>
      </main>
      {editor ? (
        <EditorDialog
          editor={editor}
          dashboard={workspace}
          onSubmit={submitEditor}
          onClose={() => setEditor(null)}
          retryNotice={mutationNotice}
          defaultProjectTier={selectedTier}
        />
      ) : selectedProject ? (
        <ProjectDetailsModal
          project={selectedProject}
          showDeliveryFields={isPeDeliveryWorkspace(workspace.slug)}
          onClose={closeProject}
          adminControls={canAdmin ? {
            onEditProject: () => setEditor({
              kind: "project",
              parentId: null,
              item: selectedProject,
            }),
            onDeleteProject: () => requestRemoveItem(selectedProject, null),
            onAddSubtask: () => setEditor({
              kind: "subtask",
              parentId: selectedProject.id,
            }),
            onEditSubtask: (subtaskId) => {
              const subtask = selectedProject.subtasks.find((item) => item.id === subtaskId);
              if (subtask) {
                setEditor({
                  kind: "subtask",
                  parentId: selectedProject.id,
                  item: subtask,
                });
              }
            },
            onDeleteSubtask: (subtaskId) => {
              const subtask = selectedProject.subtasks.find((item) => item.id === subtaskId);
              if (subtask) requestRemoveItem(subtask, selectedProject.id);
            },
            onReorderSubtask: (subtaskId, beforeId) =>
              reorderItem(subtaskId, selectedProject.id, beforeId),
          } : undefined}
          commentControls={commentControls}
        />
      ) : null}
      {pendingDelete ? (
        <ConfirmDialog
          title={
            pendingDelete.items.length === 1
              ? `Delete ${pendingDelete.items[0].item.title}?`
              : `Delete ${pendingDelete.items.length} projects?`
          }
          message={
            pendingDelete.items.length === 1
              ? `Delete ${pendingDelete.items[0].parentId ? "subtask" : "project"} "${pendingDelete.items[0].item.title}"? This cannot be undone.`
              : `Delete ${pendingDelete.items.length} selected projects? This cannot be undone.`
          }
          onConfirm={() => {
            void confirmPendingDelete();
          }}
          onCancel={() => setPendingDelete(null)}
        />
      ) : null}
      {manageKpisOpen ? (
        <ModalDialog
          labelledBy="manage-kpis-title"
          closeLabel="Close KPI manager"
          onClose={() => setManageKpisOpen(false)}
          className="admin-modal kpi-manager-modal"
        >
          <p className="eyebrow">Administration</p>
          <h2 id="manage-kpis-title">Manage KPIs</h2>
          <StatusManager initialDashboard={workspace} variant="panel" />
        </ModalDialog>
      ) : null}
    </>
  );
}
