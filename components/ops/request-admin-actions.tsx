"use client";

import { useRef, useState, type ReactNode } from "react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { deleteOpsManualItem } from "@/lib/ops/mutations";
import type { OpsRequest } from "@/lib/ops/types";
import { createClient } from "@/lib/supabase/client";
import { ManualItemForm } from "./manual-item-form";

/** What admins need inside a request's details dialog. Omitted for visitors. */
export interface OpsAdminContext {
  /** Called after any change was saved (refreshes the page data). */
  onChanged: () => void;
}

type Mode = "view" | "edit" | "delete";

/**
 * Admin actions for one request's details dialog: Edit and Delete for manual items (imported rows
 * are replaced by the next upload). While an action is open, `dialog` replaces the details dialog so only one
 * modal is mounted at a time.
 */
export function useRequestAdmin({
  request,
  admin,
  onClose,
}: {
  request: OpsRequest;
  admin: OpsAdminContext | undefined;
  onClose: () => void;
}): { dialog: ReactNode | null; actions: ReactNode | null } {
  const [mode, setMode] = useState<Mode>("view");
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const deletingRef = useRef(false);

  if (!admin) return { dialog: null, actions: null };

  const isManual = request.source === "manual";
  if (!isManual) return { dialog: null, actions: null };

  function backToDetails() {
    setDeleteError(null);
    setMode("view");
  }

  function saved() {
    admin?.onChanged();
    onClose();
  }

  async function confirmDelete() {
    if (deletingRef.current) return;
    deletingRef.current = true;
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteOpsManualItem(createClient(), request.id);
      saved();
    } catch (caught) {
      setDeleteError(caught instanceof Error ? caught.message : "Deleting failed.");
    } finally {
      deletingRef.current = false;
      setDeleting(false);
    }
  }

  let dialog: ReactNode | null = null;
  if (mode === "edit") {
    dialog = (
      <ManualItemForm
        kind={request.isMergeRequest ? "merge" : "issue"}
        team={request.team}
        item={request}
        onClose={backToDetails}
        onSaved={saved}
      />
    );
  } else if (mode === "delete") {
    dialog = (
      <ConfirmDialog
        title={`Delete ${request.interactionId}?`}
        message="This removes the item for good. This can't be undone."
        confirmLabel={deleting ? "Deleting…" : "Delete"}
        onConfirm={() => void confirmDelete()}
        onCancel={() => {
          if (!deletingRef.current) backToDetails();
        }}
        busy={deleting}
        error={deleteError}
      />
    );
  }

  const actions = (
    <div className="ops-detail-actions">
      <button type="button" className="secondary-button" onClick={() => setMode("edit")}>Edit</button>
      <button type="button" className="secondary-button delete-confirm-button" onClick={() => setMode("delete")}>
        Delete
      </button>
    </div>
  );

  return { dialog, actions };
}
