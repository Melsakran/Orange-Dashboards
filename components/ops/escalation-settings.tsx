"use client";

import { useCallback, useRef, useState, type FormEvent } from "react";
import { ModalDialog } from "@/components/ui/modal-dialog";
import { saveOpsSettings } from "@/lib/ops/mutations";
import { createClient } from "@/lib/supabase/client";

const MIN_DAYS = 1;
const MAX_DAYS = 365;
const INVALID_DAYS = "Enter a whole number of days from 1 to 365.";

function parseDays(value: string): number | null {
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const days = Number(trimmed);
  return days >= MIN_DAYS && days <= MAX_DAYS ? days : null;
}

/** Admin button showing the escalation threshold; opens a small dialog to change it. */
export function EscalationSettings({
  escalationDays,
  onSaved,
}: {
  escalationDays: number;
  /** Called after the setting was saved (refreshes the page data). */
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const saved = useCallback(() => {
    setOpen(false);
    onSaved();
  }, [onSaved]);

  return (
    <>
      <button type="button" className="secondary-button" onClick={() => setOpen(true)}>
        {`Escalation: ${escalationDays} days`}
      </button>
      {open ? (
        <EscalationDialog escalationDays={escalationDays} onClose={close} onSaved={saved} />
      ) : null}
    </>
  );
}

function EscalationDialog({
  escalationDays,
  onClose,
  onSaved,
}: {
  escalationDays: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [value, setValue] = useState(String(escalationDays));
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  // Closing is blocked while a save is in flight, like the delete confirmation.
  const handleClose = useCallback(() => {
    if (!savingRef.current) onClose();
  }, [onClose]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (savingRef.current) return;
    const days = parseDays(value);
    if (days === null) {
      setFieldError(INVALID_DAYS);
      return;
    }
    setFieldError(undefined);
    setSaveError(null);
    savingRef.current = true;
    setSaving(true);
    try {
      await saveOpsSettings(createClient(), days);
      onSaved();
    } catch (caught) {
      setSaveError(caught instanceof Error ? caught.message : "Saving the escalation days failed.");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  return (
    <ModalDialog
      labelledBy="ops-escalation-title"
      closeLabel="Close escalation settings"
      onClose={handleClose}
      className="admin-modal ops-small-modal"
    >
      <p className="eyebrow">Issues</p>
      <h2 id="ops-escalation-title">Escalation days</h2>
      <form className="work-item-form" onSubmit={(event) => void submit(event)} noValidate>
        <div className="form-field">
          <label htmlFor="ops-escalation-days">Days</label>
          <input
            id="ops-escalation-days"
            type="number"
            min={MIN_DAYS}
            max={MAX_DAYS}
            step={1}
            value={value}
            aria-invalid={Boolean(fieldError)}
            aria-describedby={fieldError ? "ops-escalation-days-error" : "ops-escalation-days-hint"}
            onChange={(event) => setValue(event.target.value)}
            data-modal-initial-focus
          />
          {fieldError ? (
            <p className="form-error" id="ops-escalation-days-error">{fieldError}</p>
          ) : (
            <p className="form-hint" id="ops-escalation-days-hint">
              Open issues older than this are flagged as needing escalation.
            </p>
          )}
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
