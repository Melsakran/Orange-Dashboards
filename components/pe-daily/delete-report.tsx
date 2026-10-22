"use client";

import { useCallback, useRef, useState } from "react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { formatReportDate } from "@/lib/pe-daily/format";
import { deletePeDailyReport } from "@/lib/pe-daily/mutations";
import { createClient } from "@/lib/supabase/client";

export function DeleteReport({ reportDate, onDeleted }: { reportDate: string; onDeleted: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busyRef = useRef(false);
  const cancel = useCallback(() => {
    if (!busyRef.current) setConfirming(false);
  }, []);

  async function confirmDelete() {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    try {
      await deletePeDailyReport(createClient(), reportDate);
      setConfirming(false);
      onDeleted();
    } catch (caught) {
      setConfirming(false);
      setError(caught instanceof Error ? caught.message : "Deleting the report failed.");
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
          setError(null);
          setConfirming(true);
        }}
      >
        Delete this date
      </button>
      {error ? (
        <div className="mutation-notice" role="alert">
          <span>{error}</span>
          <button type="button" onClick={() => void confirmDelete()}>Retry</button>
        </div>
      ) : null}
      {confirming ? (
        <ConfirmDialog
          title={`Delete the ${formatReportDate(reportDate)} report?`}
          message="This deletes the uploaded data and the admin-entered sections for this date. This can't be undone."
          confirmLabel="Delete report"
          onConfirm={() => void confirmDelete()}
          onCancel={cancel}
          busy={busy}
        />
      ) : null}
    </>
  );
}
