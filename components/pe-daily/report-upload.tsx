"use client";

import { FilePickerButton } from "@/components/ui/file-picker-button";
import { ModalDialog } from "@/components/ui/modal-dialog";
import { useFileUpload } from "@/components/ui/use-file-upload";
import { formatReportDate } from "@/lib/pe-daily/format";
import { savePeDailyReport } from "@/lib/pe-daily/mutations";
import { parseReportFile, type ParseReportResult } from "@/lib/pe-daily/parse-report";
import { createClient } from "@/lib/supabase/client";

function UploadReview({
  result,
  existingDates,
  saving,
  saveError,
  onCancel,
  onConfirm,
}: {
  result: ParseReportResult;
  existingDates: string[];
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
        <ul className="pe-daily-upload-errors">
          {result.errors.map((error, index) => (
            <li key={index}>
              {error.rowNumber ? `Row ${error.rowNumber}: ` : ""}
              {error.message}
            </li>
          ))}
        </ul>
        <div className="form-actions">
          <button type="button" className="secondary-button" onClick={onCancel}>Close</button>
        </div>
      </>
    );
  }

  const { report } = result;
  const date = formatReportDate(report.reportDate);
  return (
    <>
      <p className="ops-upload-summary">
        Report for {date}: {report.promos.length} promos, {report.sms.length} SMS rows,{" "}
        {report.upselling.length} upselling days
      </p>
      {existingDates.includes(report.reportDate) ? (
        <p>This replaces the uploaded data for {date}. Admin-entered sections are kept.</p>
      ) : null}
      {saveError ? (
        <div className="mutation-notice" role="alert">
          <span>{saveError}</span>
        </div>
      ) : null}
      <div className="form-actions">
        <button type="button" className="secondary-button" onClick={onCancel} disabled={saving}>
          Cancel
        </button>
        <button type="button" className="primary-button" onClick={onConfirm} disabled={saving}>
          {saving ? "Saving…" : saveError ? "Retry" : "Save report"}
        </button>
      </div>
    </>
  );
}

export function ReportUpload({
  existingDates,
  onUploaded,
}: {
  existingDates: string[];
  onUploaded: (reportDate: string) => void;
}) {
  const { state, close, chooseFile, confirm } = useFileUpload<ParseReportResult>({
    read: parseReportFile,
    canSave: (result) => result.ok,
    save: async (fileName, result) => {
      if (result.ok) await savePeDailyReport(createClient(), fileName, result.report);
    },
    onSaved: (result) => {
      if (result.ok) onUploaded(result.report.reportDate);
    },
  });

  return (
    <>
      <FilePickerButton inputLabel="Choose the daily report file" onFile={(file) => void chooseFile(file)} />
      {state.phase !== "idle" ? (
        <ModalDialog
          labelledBy="pe-daily-upload-title"
          closeLabel="Close upload"
          onClose={close}
          className="admin-modal"
        >
          <p className="eyebrow">Upload</p>
          <h2 id="pe-daily-upload-title">{state.fileName}</h2>
          {state.phase === "reading" ? <p role="status">Reading file…</p> : null}
          {state.phase === "failed" ? (
            <div className="mutation-notice" role="alert">
              <span>{state.message}</span>
            </div>
          ) : null}
          {state.phase === "review" ? (
            <UploadReview
              result={state.result}
              existingDates={existingDates}
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
