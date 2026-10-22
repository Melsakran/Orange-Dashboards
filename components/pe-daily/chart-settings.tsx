"use client";

import { useCallback, useRef, useState } from "react";
import { ModalDialog } from "@/components/ui/modal-dialog";
import { savePeDailyChartSettings } from "@/lib/pe-daily/mutations";
import { CHART_KEYS, CHART_LABELS, type ChartKey } from "@/lib/pe-daily/types";
import { createClient } from "@/lib/supabase/client";

export function ChartSettings({
  visibleCharts,
  onSaved,
}: {
  visibleCharts: ChartKey[];
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<ChartKey[]>(visibleCharts);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const savingRef = useRef(false);
  const close = useCallback(() => {
    if (!savingRef.current) setOpen(false);
  }, []);

  function openDialog() {
    setSelected(visibleCharts);
    setSaveError(null);
    setOpen(true);
  }

  function toggle(key: ChartKey) {
    setSelected((current) =>
      CHART_KEYS.filter((candidate) => (candidate === key ? !current.includes(candidate) : current.includes(candidate))),
    );
  }

  async function save() {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setSaveError(null);
    try {
      await savePeDailyChartSettings(createClient(), selected);
      setOpen(false);
      onSaved();
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Saving chart settings failed.");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  return (
    <>
      <button type="button" className="secondary-button" onClick={openDialog}>
        Chart settings
      </button>
      {open ? (
        <ModalDialog
          labelledBy="pe-daily-chart-settings-title"
          closeLabel="Close chart settings"
          onClose={close}
          className="admin-modal"
        >
          <p className="eyebrow">Charts</p>
          <h2 id="pe-daily-chart-settings-title">Chart settings</h2>
          <p>Choose which charts everyone sees on this page.</p>
          <fieldset className="pe-daily-chart-options">
            <legend>Visible charts</legend>
            {CHART_KEYS.map((key) => (
              <label key={key}>
                <input
                  type="checkbox"
                  checked={selected.includes(key)}
                  disabled={saving}
                  onChange={() => toggle(key)}
                />
                {CHART_LABELS[key]}
              </label>
            ))}
          </fieldset>
          {saveError ? (
            <div className="mutation-notice" role="alert">
              <span>{saveError}</span>
            </div>
          ) : null}
          <div className="form-actions">
            <button type="button" className="secondary-button" onClick={close} disabled={saving}>
              Cancel
            </button>
            <button type="button" className="primary-button" onClick={() => void save()} disabled={saving}>
              {saving ? "Saving…" : saveError ? "Retry" : "Save"}
            </button>
          </div>
        </ModalDialog>
      ) : null}
    </>
  );
}
