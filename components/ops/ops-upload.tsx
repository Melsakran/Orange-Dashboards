"use client";

import { FilePickerButton } from "@/components/ui/file-picker-button";
import { ModalDialog } from "@/components/ui/modal-dialog";
import { useFileUpload } from "@/components/ui/use-file-upload";
import { countByStatus } from "@/lib/ops/analytics";
import { replaceOpsRequests } from "@/lib/ops/mutations";
import { normalizeRequests, type NormalizeResult } from "@/lib/ops/normalize";
import { OPS_STATUSES, OPS_STATUS_LABELS } from "@/lib/ops/types";
import { parseSheetFile } from "@/lib/sheets/parse-sheet";
import { createClient } from "@/lib/supabase/client";

function UploadReview({
  result,
  manualInteractionIds,
  saving,
  saveError,
  onCancel,
  onConfirm,
}: {
  result: NormalizeResult;
  manualInteractionIds: ReadonlySet<string>;
  saving: boolean;
  saveError: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (!result.ok) {
    return (
      <>
        <div className="mutation-notice" role="alert">
          <span>
            This file can&apos;t be uploaded. {result.fileError ?? "Fix these problems and try again."} Nothing
            was changed.
          </span>
        </div>
        {result.missingHeaders.length ? (
          <p>Missing columns: {result.missingHeaders.join(", ")}</p>
        ) : null}
        {result.errors.length ? (
          <ul className="ops-upload-errors">
            {result.errors.map((error) => (
              <li key={error.rowNumber}>
                Row {error.rowNumber}
                {error.interactionId ? ` (${error.interactionId})` : ""}: {error.message}
              </li>
            ))}
          </ul>
        ) : null}
        <div className="form-actions">
          <button type="button" className="secondary-button" onClick={onCancel}>Close</button>
        </div>
      </>
    );
  }

  const counts = countByStatus(result.requests);
  const breakdown = OPS_STATUSES
    .map((status) => `${counts[status]} ${OPS_STATUS_LABELS[status].toLowerCase()}`)
    .join(", ");
  const mergeCount = result.requests.filter((request) => request.isMergeRequest).length;
  // The database replaces a manual item whose Interaction ID appears in the file.
  const fileIds = new Set(result.requests.map((request) => request.interactionId));
  const collisions = [...manualInteractionIds].filter((id) => fileIds.has(id)).length;
  return (
    <>
      <p className="ops-upload-summary">
        {result.requests.length} requests found — {breakdown} · {mergeCount} merge{" "}
        {mergeCount === 1 ? "request" : "requests"}
      </p>
      {collisions > 0 ? (
        <p>
          Replacing will update all imported Ops Requests data. {collisions} manually added{" "}
          {collisions === 1 ? "item" : "items"} with the same Interaction ID will be replaced by the
          file&apos;s rows.
        </p>
      ) : (
        <p>Replacing will update all imported Ops Requests data. Manually added items are kept.</p>
      )}
      {saveError ? (
        <div className="mutation-notice" role="alert">
          <span>{saveError}</span>
        </div>
      ) : null}
      <div className="form-actions">
        <button type="button" className="secondary-button" onClick={onCancel} disabled={saving}>
          Cancel
        </button>
        <button
          type="button"
          className="primary-button"
          onClick={onConfirm}
          disabled={saving}
          data-modal-initial-focus
        >
          {saving ? "Replacing…" : saveError ? "Retry" : "Replace data"}
        </button>
      </div>
    </>
  );
}

export function OpsUpload({
  onUploaded,
  manualInteractionIds,
}: {
  onUploaded: () => void;
  /** Interaction IDs of the manual items currently on the page. */
  manualInteractionIds: ReadonlySet<string>;
}) {
  const { state, close, chooseFile, confirm } = useFileUpload<NormalizeResult>({
    read: async (file) => normalizeRequests(await parseSheetFile(file)),
    canSave: (result) => result.ok,
    save: async (fileName, result) => {
      if (result.ok) await replaceOpsRequests(createClient(), "operations", fileName, result.requests);
    },
    onSaved: () => onUploaded(),
  });

  return (
    <>
      <FilePickerButton inputLabel="Choose a CSV or Excel file to upload" onFile={(file) => void chooseFile(file)} />
      {state.phase !== "idle" ? (
        <ModalDialog
          labelledBy="ops-upload-title"
          closeLabel="Close upload"
          onClose={close}
          className="admin-modal ops-upload-modal"
        >
          <p className="eyebrow">Upload</p>
          <h2 id="ops-upload-title">{state.fileName}</h2>
          {state.phase === "reading" ? <p role="status">Reading file…</p> : null}
          {state.phase === "failed" ? (
            <div className="mutation-notice" role="alert">
              <span>{state.message}</span>
            </div>
          ) : null}
          {state.phase === "review" ? (
            <UploadReview
              result={state.result}
              manualInteractionIds={manualInteractionIds}
              saving={state.saving}
              saveError={state.saveError}
              onCancel={close}
              onConfirm={() => void confirm()}
            />
          ) : null}
        </ModalDialog>
      ) : null}
    </>
  );
}
