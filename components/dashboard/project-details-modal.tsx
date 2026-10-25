"use client";

import { useRef, type DragEvent } from "react";
import type { DashboardComment, DashboardProject } from "@/lib/data/dashboard";
import type { CommentInput } from "@/lib/data/comment-mutations";
import { CommentSection } from "@/components/admin/comments/comment-section";
import { ProgressBar } from "@/components/ui/progress-bar";
import { ModalDialog } from "@/components/ui/modal-dialog";
import { deliverySummary } from "@/lib/dashboard/card-format";

interface ProjectDetailsModalProps {
  project: DashboardProject;
  showDeliveryFields?: boolean;
  onClose: () => void;
  adminControls?: {
    onEditProject: () => void;
    onDeleteProject: () => void;
    onAddSubtask: () => void;
    onEditSubtask: (subtaskId: string) => void;
    onDeleteSubtask: (subtaskId: string) => void;
    onReorderSubtask: (subtaskId: string, beforeId: string | null) => void;
  };
  commentControls?: {
    onCreate: (
      itemId: string,
      id: string,
      input: CommentInput,
    ) => Promise<DashboardComment | void>;
    onUpdate: (
      itemId: string,
      comment: DashboardComment,
      input: CommentInput,
    ) => Promise<DashboardComment | void>;
    onDelete: (itemId: string, comment: DashboardComment) => Promise<void>;
    onRefresh: (itemId: string) => Promise<DashboardComment[]>;
  };
}

export function ProjectDetailsModal({
  project,
  showDeliveryFields = false,
  onClose,
  adminControls,
  commentControls,
}: ProjectDetailsModalProps) {
  const dragSubtaskIdRef = useRef<string | null>(null);

  function handleSubtaskDragStart(subtaskId: string, event: DragEvent<HTMLElement>) {
    dragSubtaskIdRef.current = subtaskId;
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", subtaskId);
    event.currentTarget.closest("li")?.classList.add("subtask-dragging");
  }

  function handleSubtaskDragOver(event: DragEvent<HTMLLIElement>) {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    event.currentTarget.classList.add("subtask-drop-target");
  }

  function handleSubtaskDragLeave(event: DragEvent<HTMLLIElement>) {
    event.currentTarget.classList.remove("subtask-drop-target");
  }

  function handleSubtaskDrop(beforeId: string, event: DragEvent<HTMLLIElement>) {
    event.preventDefault();
    event.currentTarget.classList.remove("subtask-drop-target");
    const sourceId = event.dataTransfer.getData("text/plain") || dragSubtaskIdRef.current;
    if (!adminControls || !sourceId || sourceId === beforeId) return;
    adminControls.onReorderSubtask(sourceId, beforeId);
  }

  function handleSubtaskDragEnd(event: DragEvent<HTMLElement>) {
    event.currentTarget.closest("li")?.classList.remove("subtask-dragging");
    dragSubtaskIdRef.current = null;
  }

  return (
    <ModalDialog
      labelledBy={`project-title-${project.id}`}
      closeLabel="Close project details"
      onClose={onClose}
    >
        <p className="status-badge">
          <span aria-hidden="true" style={{ backgroundColor: project.statusColor }} />
          {project.statusName}
        </p>
        {project.syncSource === "jira" ? (
          <p className="hierarchy-badge" aria-label="Parent work item">
            Parent
            {project.subtasks.length
              ? ` · ${project.subtasks.length} child${project.subtasks.length === 1 ? "" : "ren"}`
              : ""}
          </p>
        ) : null}
        <h2 id={`project-title-${project.id}`}>
          {project.title}
          {project.jiraIssueKey ? (
            <span className="jira-key">
              {project.jiraUrl ? (
                <a href={project.jiraUrl} target="_blank" rel="noreferrer">
                  {project.jiraIssueKey}
                </a>
              ) : (
                project.jiraIssueKey
              )}
            </span>
          ) : null}
        </h2>
        <p className="modal-description">{project.description}</p>
        <ProgressBar label={`${project.title} progress`} value={project.progress} />
        <dl className="modal-meta">
          <div>
            <dt>Owner</dt>
            <dd>{project.owner}</dd>
          </div>
          <div>
            <dt>Priority</dt>
            <dd>{project.priority}</dd>
          </div>
        </dl>
        {adminControls ? (
          <div className="admin-actions project-admin-actions">
            <button type="button" onClick={adminControls.onEditProject}>
              Edit {project.title}
            </button>
            <button type="button" onClick={adminControls.onAddSubtask}>
              Add subtask
            </button>
            <button
              type="button"
              className="delete-button"
              aria-label={`Delete ${project.title}`}
              onClick={adminControls.onDeleteProject}
            >
              Delete
            </button>
          </div>
        ) : null}
        <section className="subtasks" aria-labelledby={`subtasks-title-${project.id}`}>
          <h3 id={`subtasks-title-${project.id}`}>
            {project.syncSource === "jira" ? "Children" : "Subtasks"}
          </h3>
          {project.subtasks.length ? (
            <ul>
              {project.subtasks.map((subtask) => (
                <li
                  key={subtask.id}
                  onDragOver={adminControls ? handleSubtaskDragOver : undefined}
                  onDragLeave={adminControls ? handleSubtaskDragLeave : undefined}
                  onDrop={adminControls
                    ? (event) => handleSubtaskDrop(subtask.id, event)
                    : undefined}
                  className={adminControls ? "subtask-draggable" : undefined}
                >
                  <div>
                    <strong>
                      {subtask.title}
                      {subtask.jiraIssueKey ? (
                        <span className="jira-key">
                          {subtask.jiraUrl ? (
                            <a href={subtask.jiraUrl} target="_blank" rel="noreferrer">
                              {subtask.jiraIssueKey}
                            </a>
                          ) : (
                            subtask.jiraIssueKey
                          )}
                        </span>
                      ) : null}
                    </strong>
                    <small>
                      {showDeliveryFields
                        ? [subtask.statusName, deliverySummary(subtask)].filter(Boolean).join(" · ")
                        : `${subtask.statusName} · ${subtask.progress}%`}
                    </small>
                    {adminControls ? (
                      <button
                        type="button"
                        className="drag-handle drag-handle-inline"
                        draggable
                        aria-label={`Drag to reorder ${subtask.title}`}
                        onDragStart={(event) => handleSubtaskDragStart(subtask.id, event)}
                        onDragEnd={handleSubtaskDragEnd}
                      >
                        Drag to reorder
                      </button>
                    ) : null}
                  </div>
                  {adminControls ? (
                    <div className="admin-actions">
                      <button
                        type="button"
                        onClick={() => adminControls.onEditSubtask(subtask.id)}
                      >
                        Edit {subtask.title}
                      </button>
                      <button
                        type="button"
                        className="delete-button"
                        aria-label={`Delete ${subtask.title}`}
                        onClick={() => adminControls.onDeleteSubtask(subtask.id)}
                      >
                        Delete
                      </button>
                    </div>
                  ) : null}
                  <CommentSection
                    itemId={subtask.id}
                    label={`${subtask.title} comments`}
                    comments={subtask.comments}
                    admin={Boolean(commentControls)}
                    onCreate={commentControls
                      ? (id, input) => commentControls.onCreate(subtask.id, id, input)
                      : undefined}
                    onUpdate={commentControls
                      ? (comment, input) => commentControls.onUpdate(subtask.id, comment, input)
                      : undefined}
                    onDelete={commentControls
                      ? (comment) => commentControls.onDelete(subtask.id, comment)
                      : undefined}
                    onRefresh={commentControls
                      ? () => commentControls.onRefresh(subtask.id)
                      : undefined}
                  />
                </li>
              ))}
            </ul>
          ) : (
            <p>No subtasks yet.</p>
          )}
        </section>
        <CommentSection
          itemId={project.id}
          label="Project comments"
          comments={project.comments}
          admin={Boolean(commentControls)}
          onCreate={commentControls
            ? (id, input) => commentControls.onCreate(project.id, id, input)
            : undefined}
          onUpdate={commentControls
            ? (comment, input) => commentControls.onUpdate(project.id, comment, input)
            : undefined}
          onDelete={commentControls
            ? (comment) => commentControls.onDelete(project.id, comment)
            : undefined}
          onRefresh={commentControls
            ? () => commentControls.onRefresh(project.id)
            : undefined}
        />
    </ModalDialog>
  );
}
