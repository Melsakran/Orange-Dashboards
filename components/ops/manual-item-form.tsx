"use client";

import { useCallback, useRef, useState, type FormEvent } from "react";
import { ModalDialog } from "@/components/ui/modal-dialog";
import { saveOpsManualItem } from "@/lib/ops/mutations";
import {
  OPS_STATUSES,
  OPS_STATUS_LABELS,
  isOpsStatus,
  type OpsArea,
  type OpsRequest,
  type OpsStatus,
} from "@/lib/ops/types";
import { createClient } from "@/lib/supabase/client";
import { AreaOwnerFields, useAreaOwner } from "./area-owner-fields";

export type ManualItemKind = "merge" | "issue";

type FieldErrors = Partial<Record<"title" | "assignmentTime" | "closeDate" | "area", string>>;

/** Wall-clock 'YYYY-MM-DDTHH:MM:SS' to the 'YYYY-MM-DDTHH:MM' a datetime-local input expects. */
function toInputValue(value: string | null) {
  return value ? value.slice(0, 16) : "";
}

/** 'YYYY-MM-DDTHH:MM' from a datetime-local input to the stored wall-clock string. */
function toStoredValue(value: string) {
  return value.length === 16 ? `${value}:00` : value;
}

export function ManualItemForm({
  kind,
  areas = [],
  item,
  onClose,
  onSaved,
}: {
  kind: ManualItemKind;
  /** Needed for issues (Area select). */
  areas?: OpsArea[];
  /** The manual item being edited; omit to add a new one. */
  item?: OpsRequest;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isIssue = kind === "issue";
  const [interactionId, setInteractionId] = useState(item?.interactionId ?? "");
  const [title, setTitle] = useState(item?.requestTitle ?? "");
  const [description, setDescription] = useState(item?.description ?? "");
  const [requestor, setRequestor] = useState(item?.requestorName ?? "");
  const [assignee, setAssignee] = useState(item?.assignedTo ?? "");
  const [status, setStatus] = useState<OpsStatus>(item?.status ?? "open");
  const [assignmentTime, setAssignmentTime] = useState(toInputValue(item?.assignmentTime ?? null));
  const [closeDate, setCloseDate] = useState(toInputValue(item?.closeDate ?? null));
  const [closureCode, setClosureCode] = useState(item?.closureCode ?? "");
  const areaOwner = useAreaOwner(areas, item?.areaId ?? null, item?.ownerName ?? "");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const isClosed = status === "closed";
  // Closing is blocked while a save is in flight, like the delete confirmation.
  const handleClose = useCallback(() => {
    if (!savingRef.current) onClose();
  }, [onClose]);

  const heading = `${item ? "Edit" : "Add"} ${isIssue ? "issue" : "merge request"}`;

  function validate(): FieldErrors {
    const found: FieldErrors = {};
    if (!title.trim()) found.title = "Title is required.";
    if (!assignmentTime) found.assignmentTime = "Assignment time is required.";
    if (isClosed && !closeDate) {
      found.closeDate = "Close time is required for closed items.";
    } else if (isClosed && assignmentTime && closeDate < assignmentTime) {
      found.closeDate = "Close time can't be earlier than the assignment time.";
    }
    if (isIssue && !areaOwner.areaId) found.area = "Choose an area.";
    return found;
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (savingRef.current) return;
    const found = validate();
    setErrors(found);
    if (Object.keys(found).length) return;

    setSaveError(null);
    savingRef.current = true;
    setSaving(true);
    try {
      await saveOpsManualItem(createClient(), {
        id: item?.id,
        kind,
        interactionId: interactionId.trim(),
        status,
        assignmentTime: toStoredValue(assignmentTime),
        closeDate: isClosed && closeDate ? toStoredValue(closeDate) : null,
        requestTitle: title.trim(),
        description: description.trim(),
        requestorName: requestor.trim(),
        assignedTo: assignee.trim(),
        closureCode: closureCode.trim(),
        areaId: isIssue ? areaOwner.areaId : null,
        ownerName: isIssue ? areaOwner.ownerToSave() : "",
      });
      onSaved();
    } catch (caught) {
      setSaveError(caught instanceof Error ? caught.message : "Saving failed.");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  return (
    <ModalDialog
      labelledBy="ops-manual-form-title"
      closeLabel="Close form"
      onClose={handleClose}
      className="admin-modal ops-form-modal"
    >
      <h2 id="ops-manual-form-title">{heading}</h2>
      <form className="work-item-form" onSubmit={(event) => void submit(event)} noValidate>
        <div className="form-field">
          <label htmlFor="ops-manual-id">Interaction ID</label>
          <input
            id="ops-manual-id"
            value={interactionId}
            aria-describedby="ops-manual-id-hint"
            onChange={(event) => setInteractionId(event.target.value)}
          />
          <p className="form-hint" id="ops-manual-id-hint">Leave blank to generate one</p>
        </div>
        <div className="form-field">
          <label htmlFor="ops-manual-title">Title</label>
          <input
            id="ops-manual-title"
            value={title}
            aria-invalid={Boolean(errors.title)}
            aria-describedby={errors.title ? "ops-manual-title-error" : undefined}
            onChange={(event) => setTitle(event.target.value)}
          />
          {errors.title ? <p className="form-error" id="ops-manual-title-error">{errors.title}</p> : null}
        </div>
        <div className="form-field">
          <label htmlFor="ops-manual-description">Description</label>
          <textarea
            id="ops-manual-description"
            rows={3}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
        </div>
        <div className="form-row">
          <div className="form-field">
            <label htmlFor="ops-manual-requestor">Requestor</label>
            <input
              id="ops-manual-requestor"
              value={requestor}
              onChange={(event) => setRequestor(event.target.value)}
            />
          </div>
          <div className="form-field">
            <label htmlFor="ops-manual-assignee">Assignee</label>
            <input
              id="ops-manual-assignee"
              value={assignee}
              onChange={(event) => setAssignee(event.target.value)}
            />
          </div>
        </div>
        {isIssue ? (
          <AreaOwnerFields areas={areas} state={areaOwner} areaError={errors.area} idPrefix="ops-manual" />
        ) : null}
        <div className="form-field">
          <label htmlFor="ops-manual-status">Status</label>
          <select
            id="ops-manual-status"
            value={status}
            onChange={(event) => {
              if (isOpsStatus(event.target.value)) setStatus(event.target.value);
            }}
          >
            {OPS_STATUSES.map((value) => (
              <option key={value} value={value}>{OPS_STATUS_LABELS[value]}</option>
            ))}
          </select>
        </div>
        <div className="form-row">
          <div className="form-field">
            <label htmlFor="ops-manual-assigned">Assignment date and time</label>
            <input
              id="ops-manual-assigned"
              type="datetime-local"
              value={assignmentTime}
              aria-invalid={Boolean(errors.assignmentTime)}
              aria-describedby={errors.assignmentTime ? "ops-manual-assigned-error" : undefined}
              onChange={(event) => setAssignmentTime(event.target.value)}
            />
            {errors.assignmentTime ? (
              <p className="form-error" id="ops-manual-assigned-error">{errors.assignmentTime}</p>
            ) : null}
          </div>
          <div className="form-field">
            <label htmlFor="ops-manual-closed">Close date and time</label>
            <input
              id="ops-manual-closed"
              type="datetime-local"
              value={closeDate}
              disabled={!isClosed}
              aria-invalid={Boolean(errors.closeDate)}
              aria-describedby={errors.closeDate ? "ops-manual-closed-error" : undefined}
              onChange={(event) => setCloseDate(event.target.value)}
            />
            {errors.closeDate ? (
              <p className="form-error" id="ops-manual-closed-error">{errors.closeDate}</p>
            ) : null}
          </div>
        </div>
        <div className="form-field">
          <label htmlFor="ops-manual-closure">Closure code</label>
          <input
            id="ops-manual-closure"
            value={closureCode}
            onChange={(event) => setClosureCode(event.target.value)}
          />
        </div>
        {saveError ? (
          <div className="mutation-notice" role="alert">
            <span>{saveError}</span>
          </div>
        ) : null}
        <div className="form-actions">
          <button type="button" className="secondary-button" onClick={handleClose} disabled={saving}>
            Cancel
          </button>
          <button type="submit" className="primary-button" disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </form>
    </ModalDialog>
  );
}
