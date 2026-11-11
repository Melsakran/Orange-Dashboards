"use client";

import { useRef, useState, type FormEvent } from "react";
import { ModalDialog } from "@/components/ui/modal-dialog";
import { routeOpsRequest } from "@/lib/ops/mutations";
import type { OpsArea, OpsRequest } from "@/lib/ops/types";
import { createClient } from "@/lib/supabase/client";
import { AreaOwnerFields, useAreaOwner } from "./area-owner-fields";

export function RouteIssueDialog({
  request,
  areas,
  onClose,
  onSaved,
}: {
  request: OpsRequest;
  areas: OpsArea[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const state = useAreaOwner(areas, request.areaId, request.ownerName);
  const [areaError, setAreaError] = useState<string | undefined>();
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (savingRef.current) return;
    if (!state.areaId) {
      setAreaError("Choose an area.");
      return;
    }
    setAreaError(undefined);
    setSaveError(null);
    savingRef.current = true;
    setSaving(true);
    try {
      await routeOpsRequest(createClient(), request.id, state.areaId, state.ownerToSave());
      onSaved();
    } catch (caught) {
      setSaveError(caught instanceof Error ? caught.message : "Routing the issue failed.");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  return (
    <ModalDialog
      labelledBy="ops-route-title"
      closeLabel="Close routing"
      onClose={onClose}
      className="admin-modal ops-form-modal"
    >
      <p className="eyebrow">{request.interactionId}</p>
      <h2 id="ops-route-title">Route issue</h2>
      <form className="work-item-form" onSubmit={(event) => void submit(event)} noValidate>
        <AreaOwnerFields areas={areas} state={state} areaError={areaError} idPrefix="ops-route" />
        {saveError ? (
          <div className="mutation-notice" role="alert">
            <span>{saveError}</span>
          </div>
        ) : null}
        <div className="form-actions">
          <button type="button" className="secondary-button" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button type="submit" className="primary-button" disabled={saving}>
            {saving ? "Saving…" : "Save routing"}
          </button>
        </div>
      </form>
    </ModalDialog>
  );
}
