"use client";

import { useMemo, useRef, useState } from "react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ModalDialog } from "@/components/ui/modal-dialog";
import { deleteOpsArea, saveOpsArea } from "@/lib/ops/mutations";
import {
  OPS_AREA_GROUPS,
  OPS_AREA_GROUP_LABELS,
  type OpsArea,
  type OpsAreaGroup,
} from "@/lib/ops/types";
import { createClient } from "@/lib/supabase/client";

interface Draft {
  name: string;
  ownerName: string;
  reportsTo: string;
}

const EMPTY_DRAFT: Draft = { name: "", ownerName: "", reportsTo: "" };

function draftOf(area: OpsArea): Draft {
  return { name: area.name, ownerName: area.ownerName, reportsTo: area.reportsTo };
}

function sortAreas(list: OpsArea[]) {
  return [...list].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
}

function failureMessage(caught: unknown) {
  return caught instanceof Error ? caught.message : "Saving the area failed.";
}

function DraftFields({
  draft,
  onChange,
  disabled,
  nameError,
  idPrefix,
}: {
  draft: Draft;
  onChange: (changes: Partial<Draft>) => void;
  disabled: boolean;
  nameError?: string;
  /** Makes the error element id unique per row. */
  idPrefix: string;
}) {
  const errorId = `${idPrefix}-name-error`;
  return (
    <div className="ops-area-fields">
      <div className="form-field">
        <input
          aria-label="Name"
          placeholder="Name"
          value={draft.name}
          aria-invalid={Boolean(nameError)}
          aria-describedby={nameError ? errorId : undefined}
          disabled={disabled}
          onChange={(event) => onChange({ name: event.target.value })}
        />
        {nameError ? <p className="form-error" id={errorId} role="alert">{nameError}</p> : null}
      </div>
      <div className="form-field">
        <input
          aria-label="Owner"
          placeholder="Owner"
          value={draft.ownerName}
          disabled={disabled}
          onChange={(event) => onChange({ ownerName: event.target.value })}
        />
      </div>
      <div className="form-field">
        <input
          aria-label="Reports to"
          placeholder="Reports to"
          value={draft.reportsTo}
          disabled={disabled}
          onChange={(event) => onChange({ reportsTo: event.target.value })}
        />
      </div>
    </div>
  );
}

/** Admin dialog to edit, add and delete the ownership areas that issues are routed to. */
export function ManageAreasDialog({
  areas,
  onClose,
  onChanged,
}: {
  areas: OpsArea[];
  onClose: () => void;
  /** Called after any change was saved (refreshes the page data). */
  onChanged: () => void;
}) {
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [addDrafts, setAddDrafts] = useState<Partial<Record<OpsAreaGroup, Draft>>>({});
  // Keys are an area id or `add:<group>`.
  const [nameErrors, setNameErrors] = useState<Record<string, string>>({});
  const [saveErrors, setSaveErrors] = useState<Record<string, string>>({});
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const busyRef = useRef(false);
  const [confirming, setConfirming] = useState<OpsArea | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const grouped = useMemo(
    () =>
      OPS_AREA_GROUPS.map((group) => ({
        group,
        areas: sortAreas(areas.filter((area) => area.group === group)),
      })),
    [areas],
  );

  function setKeyed(
    update: (updater: (current: Record<string, string>) => Record<string, string>) => void,
    key: string,
    message: string | null,
  ) {
    update((current) => {
      const next = { ...current };
      if (message) next[key] = message;
      else delete next[key];
      return next;
    });
  }

  async function run(key: string, action: () => Promise<void>): Promise<boolean> {
    if (busyRef.current) return false;
    busyRef.current = true;
    setBusyKey(key);
    try {
      await action();
      return true;
    } finally {
      busyRef.current = false;
      setBusyKey(null);
    }
  }

  async function saveRow(area: OpsArea) {
    const draft = drafts[area.id] ?? draftOf(area);
    const name = draft.name.trim();
    setKeyed(setSaveErrors, area.id, null);
    if (!name) {
      setKeyed(setNameErrors, area.id, "Name is required.");
      return;
    }
    setKeyed(setNameErrors, area.id, null);
    const ownerName = draft.ownerName.trim();
    const reportsTo = draft.reportsTo.trim();
    try {
      const ran = await run(area.id, async () => {
        await saveOpsArea(createClient(), {
          id: area.id,
          group: area.group,
          name,
          ownerName,
          reportsTo,
          sortOrder: area.sortOrder,
        });
      });
      if (!ran) return;
      setDrafts((current) => ({ ...current, [area.id]: { name, ownerName, reportsTo } }));
      onChanged();
    } catch (caught) {
      setKeyed(setSaveErrors, area.id, failureMessage(caught));
    }
  }

  async function addArea(group: OpsAreaGroup) {
    const key = `add:${group}`;
    const draft = addDrafts[group] ?? EMPTY_DRAFT;
    const name = draft.name.trim();
    setKeyed(setSaveErrors, key, null);
    if (!name) {
      setKeyed(setNameErrors, key, "Name is required.");
      return;
    }
    setKeyed(setNameErrors, key, null);
    const sortOrder =
      areas.filter((area) => area.group === group).reduce((max, area) => Math.max(max, area.sortOrder), -1) + 1;
    try {
      const ran = await run(key, async () => {
        await saveOpsArea(createClient(), {
          group,
          name,
          ownerName: draft.ownerName.trim(),
          reportsTo: draft.reportsTo.trim(),
          sortOrder,
        });
      });
      if (!ran) return;
      setAddDrafts((current) => ({ ...current, [group]: EMPTY_DRAFT }));
      onChanged();
    } catch (caught) {
      setKeyed(setSaveErrors, key, failureMessage(caught));
    }
  }

  async function confirmDelete() {
    if (!confirming) return;
    const area = confirming;
    setDeleteError(null);
    try {
      const ran = await run(`delete:${area.id}`, async () => {
        await deleteOpsArea(createClient(), area.id);
      });
      if (!ran) return;
      setDrafts((current) => {
        const next = { ...current };
        delete next[area.id];
        return next;
      });
      setConfirming(null);
      onChanged();
    } catch (caught) {
      setDeleteError(failureMessage(caught));
    }
  }

  if (confirming) {
    return (
      <ConfirmDialog
        title={`Delete ${confirming.name}?`}
        message={`Delete ${confirming.name}? Its issues become Unrouted.`}
        confirmLabel={busyKey ? "Deleting…" : "Delete"}
        onConfirm={() => void confirmDelete()}
        onCancel={() => {
          if (busyRef.current) return;
          setConfirming(null);
          setDeleteError(null);
        }}
        busy={busyKey !== null}
        error={deleteError}
      />
    );
  }

  return (
    <ModalDialog
      labelledBy="ops-areas-title"
      closeLabel="Close manage areas"
      onClose={onClose}
      className="admin-modal ops-areas-modal"
    >
      <p className="eyebrow">Issues</p>
      <h2 id="ops-areas-title">Manage areas</h2>
      <p className="form-hint">
        Areas own issues. Deleting an area leaves its issues Unrouted.
      </p>
      {grouped.map(({ group, areas: groupAreas }) => {
        const label = OPS_AREA_GROUP_LABELS[group];
        const addKey = `add:${group}`;
        const addDraft = addDrafts[group] ?? EMPTY_DRAFT;
        return (
          <section key={group} className="ops-areas-group">
            <h3>{label}</h3>
            <ul className="ops-areas-list">
              {groupAreas.map((area) => {
                const draft = drafts[area.id] ?? draftOf(area);
                const busy = busyKey !== null;
                return (
                  <li key={area.id}>
                    <div role="group" aria-label={`Area ${area.name}`} className="ops-area-row">
                      <DraftFields
                        idPrefix={`ops-area-${area.id}`}
                        draft={draft}
                        disabled={busy}
                        nameError={nameErrors[area.id]}
                        onChange={(changes) =>
                          setDrafts((current) => ({ ...current, [area.id]: { ...(current[area.id] ?? draftOf(area)), ...changes } }))
                        }
                      />
                      <div className="ops-area-actions">
                        <button
                          type="button"
                          className="secondary-button"
                          disabled={busy}
                          onClick={() => void saveRow(area)}
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          className="secondary-button"
                          disabled={busy}
                          onClick={() => {
                            setDeleteError(null);
                            setConfirming(area);
                          }}
                        >
                          Delete
                        </button>
                      </div>
                      {saveErrors[area.id] ? (
                        <div className="mutation-notice" role="alert">
                          <span>{saveErrors[area.id]}</span>
                        </div>
                      ) : null}
                    </div>
                  </li>
                );
              })}
              <li>
                <div role="group" aria-label={`Add area to ${label}`} className="ops-area-row ops-area-add-row">
                  <DraftFields
                    idPrefix={`ops-area-add-${group}`}
                    draft={addDraft}
                    disabled={busyKey !== null}
                    nameError={nameErrors[addKey]}
                    onChange={(changes) =>
                      setAddDrafts((current) => ({ ...current, [group]: { ...(current[group] ?? EMPTY_DRAFT), ...changes } }))
                    }
                  />
                  <div className="ops-area-actions">
                    <button
                      type="button"
                      className="primary-button"
                      disabled={busyKey !== null}
                      onClick={() => void addArea(group)}
                    >
                      Add
                    </button>
                  </div>
                  {saveErrors[addKey] ? (
                    <div className="mutation-notice" role="alert">
                      <span>{saveErrors[addKey]}</span>
                    </div>
                  ) : null}
                </div>
              </li>
            </ul>
          </section>
        );
      })}
    </ModalDialog>
  );
}
