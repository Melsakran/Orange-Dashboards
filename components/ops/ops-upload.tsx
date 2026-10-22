"use client";

import { useCallback, useRef, useState } from "react";
import { ModalDialog } from "@/components/ui/modal-dialog";
import { countByStatus } from "@/lib/ops/analytics";
import { replaceOpsRequests } from "@/lib/ops/mutations";
import { normalizeRequests, type NormalizeResult } from "@/lib/ops/normalize";
import { parseSheetFile } from "@/lib/ops/parse-sheet";
import { OPS_STATUSES, OPS_STATUS_LABELS } from "@/lib/ops/types";
import { createClient } from "@/lib/supabase/client";

type UploadState =
  | { phase: "idle" }
  | { phase: "reading"; fileName: string }
  | { phase: "failed"; fileName: string; message: string }
  | {
      phase: "review";
      fileName: string;
      result: NormalizeResult;
      saving: boolean;
      saveError: string | null;
    };

function UploadReview({
  result,
  saving,
  saveError,
  onCancel,
  onConfirm,
}: {
  result: NormalizeResult;
  saving: boolean;
  saveError: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (!result.ok) {
    return (
      <>
        <div className="mutation-notice" role="alert">
          <span>This file can&apos;t be uploaded. Fix these problems and try again. Nothing was changed.</span>
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
  return (
    <>
      <p className="ops-upload-summary">
        {result.requests.length} requests found — {breakdown}
      </p>
      <p>Replacing will delete all current Ops Requests data and show only this file.</p>
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

export function OpsUpload({ onUploaded }: { onUploaded: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<UploadState>({ phase: "idle" });
  const attemptRef = useRef(0);
  const close = useCallback(
    () =>
      setState((current) =>
        current.phase === "review" && current.saving ? current : { phase: "idle" },
      ),
    [],
  );

  async function readFile(file: File) {
    const attempt = ++attemptRef.current;
    setState({ phase: "reading", fileName: file.name });
    let next: UploadState;
    try {
      const result = normalizeRequests(await parseSheetFile(file));
      next = { phase: "review", fileName: file.name, result, saving: false, saveError: null };
    } catch (error) {
      next = {
        phase: "failed",
        fileName: file.name,
        message: error instanceof Error ? error.message : "The file could not be read.",
      };
    }
    if (attempt !== attemptRef.current) return;
    setState((current) => (current.phase === "reading" ? next : current));
  }

  async function save() {
    if (state.phase !== "review" || !state.result.ok || state.saving) return;
    const attempt = attemptRef.current;
    const { fileName, result } = state;
    setState({ ...state, saving: true, saveError: null });
    try {
      await replaceOpsRequests(createClient(), fileName, result.requests);
      if (attempt !== attemptRef.current) return;
      setState({ phase: "idle" });
      onUploaded();
    } catch (error) {
      if (attempt !== attemptRef.current) return;
      setState({
        phase: "review",
        fileName,
        result,
        saving: false,
        saveError: error instanceof Error ? error.message : "Upload failed.",
      });
    }
  }

  return (
    <>
      <button type="button" className="primary-button" onClick={() => inputRef.current?.click()}>
        Upload
      </button>
      <input
        ref={inputRef}
        type="file"
        className="ops-file-input"
        accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        aria-label="Choose a CSV or Excel file to upload"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) void readFile(file);
        }}
      />
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
              saving={state.saving}
              saveError={state.saveError}
              onCancel={close}
              onConfirm={() => void save()}
            />
          ) : null}
        </ModalDialog>
      ) : null}
    </>
  );
}
