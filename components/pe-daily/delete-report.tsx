"use client";

import { useCallback, useRef, useState } from "react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { formatReportDate } from "@/lib/pe-daily/format";
import { deletePeDailyReport } from "@/lib/pe-daily/mutations";
import { createClient } from "@/lib/supabase/client";

export function DeleteReport({ reportDate, onDeleted }: { reportDate: string; onDeleted: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<{ date: string; message: string } | null>(null);
  const busyRef = useRef(false);
  const cancel = useCallback(() => {
    if (!busyRef.current) setConfirming(false);
  }, []);
  const error = failure?.date === reportDate ? failure : null;

  async function deleteDate(date: string) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      await deletePeDailyReport(createClient(), date);
      setFailure(null);
      setConfirming(false);
      onDeleted();
    } catch (caught) {
      setConfirming(false);
      setFailure({ date, message: caught instanceof Error ? caught.message : "Deleting the report failed." });
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className="secondary-button delete-confirm-button"
        onClick={() => {
          setFailure(null);
          setConfirming(true);
        }}
      >
        Delete this date
      </button>
      {error ? (
        <div className="mutation-notice" role="alert">
          <span>{error.message}</span>
          <button type="button" disabled={busy} onClick={() => void deleteDate(error.date)}>
            {busy ? "Deleting…" : "Retry"}
          </button>
        </div>
      ) : null}
      {confirming ? (
        <ConfirmDialog
          title={`Delete the ${formatReportDate(reportDate)} report?`}
          message="This deletes the uploaded data and the admin-entered sections for this date. This can't be undone."
          confirmLabel="Delete report"
          onConfirm={() => void deleteDate(reportDate)}
          onCancel={cancel}
          busy={busy}
        />
      ) : null}
    </>
  );
}
