"use client";

import { useState, type ReactNode } from "react";
import { savePeDailySection } from "@/lib/pe-daily/mutations";
import {
  displayManualValue,
  emptyDraftRow,
  toDraftRow,
  validateDraftRows,
  type DraftRow,
  type DraftValidation,
  type SectionDefinition,
} from "@/lib/pe-daily/sections";
import type { ManualRow } from "@/lib/pe-daily/types";
import { createClient } from "@/lib/supabase/client";
import { DataTable, type Column } from "./data-table";
import { SectionPanel } from "./section-panel";

export interface ManualSectionProps {
  section: SectionDefinition;
  rows: ManualRow[];
  reportDate: string;
  isAdmin: boolean;
  onSaved: () => void;
  children?: ReactNode;
}

export function manualColumns(section: SectionDefinition): Column<ManualRow>[] {
  return [
    { key: "#", header: "#", numeric: true, cell: (_row, index) => index + 1 },
    ...section.fields.map((field) => ({
      key: field.key,
      header: field.label,
      numeric: field.type === "count",
      cell: (row: ManualRow) => displayManualValue(field, row[field.key]),
    })),
  ];
}

function SectionEditor({
  section,
  drafts,
  validation,
  saving,
  saveError,
  onChange,
  onAdd,
  onRemove,
  onCancel,
  onSave,
}: {
  section: SectionDefinition;
  drafts: DraftRow[];
  validation: DraftValidation;
  saving: boolean;
  saveError: string | null;
  onChange: (index: number, key: string, value: string) => void;
  onAdd: () => void;
  onRemove: (index: number) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  return (
    <div className="pe-daily-editor">
      {saveError ? (
        <div className="mutation-notice" role="alert">
          <span>{saveError}</span>
        </div>
      ) : null}
      <div className="pe-daily-table-wrap">
        <table className="pe-daily-table" aria-label={`Edit ${section.title}`}>
          <thead>
            <tr>
              <th scope="col" className="pe-daily-number">#</th>
              {section.fields.map((field) => (
                <th key={field.key} scope="col">
                  {field.label}
                  {field.required ? " *" : ""}
                </th>
              ))}
              <th scope="col" aria-label="Row actions" />
            </tr>
          </thead>
          <tbody>
            {drafts.map((draft, index) => (
              <tr key={index}>
                <td className="pe-daily-number">{index + 1}</td>
                {section.fields.map((field) => {
                  const error = validation.errors[index]?.[field.key];
                  const id = `pe-daily-${section.key}-${index}-${field.key}`;
                  return (
                    <td key={field.key}>
                      <input
                        id={id}
                        className="pe-daily-input"
                        value={draft[field.key] ?? ""}
                        inputMode={field.type === "count" ? "numeric" : undefined}
                        aria-label={`${field.label}, row ${index + 1}`}
                        aria-invalid={error ? true : undefined}
                        aria-describedby={error ? `${id}-error` : undefined}
                        disabled={saving}
                        onChange={(event) => onChange(index, field.key, event.target.value)}
                      />
                      {error ? (
                        <span id={`${id}-error`} className="pe-daily-field-error">{error}</span>
                      ) : null}
                    </td>
                  );
                })}
                <td>
                  <button
                    type="button"
                    className="secondary-button"
                    aria-label={`Delete row ${index + 1}`}
                    disabled={saving}
                    onClick={() => onRemove(index)}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="form-actions">
        <button type="button" className="secondary-button" onClick={onAdd} disabled={saving}>
          Add row
        </button>
        <button type="button" className="secondary-button" onClick={onCancel} disabled={saving}>
          Cancel
        </button>
        <button
          type="button"
          className="primary-button"
          onClick={onSave}
          disabled={saving || !validation.valid}
        >
          {saving ? "Saving…" : saveError ? "Retry" : "Save"}
        </button>
      </div>
    </div>
  );
}

export function ManualSection({ section, rows, reportDate, isAdmin, onSaved, children }: ManualSectionProps) {
  const [drafts, setDrafts] = useState<DraftRow[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const validation = drafts ? validateDraftRows(section, drafts) : null;

  function startEditing() {
    setDrafts(rows.length ? rows.map((row) => toDraftRow(section, row)) : [emptyDraftRow(section)]);
    setSaveError(null);
  }

  function cancel() {
    if (saving) return;
    setDrafts(null);
    setSaveError(null);
  }

  function updateDraft(index: number, key: string, value: string) {
    setDrafts((current) =>
      current ? current.map((draft, i) => (i === index ? { ...draft, [key]: value } : draft)) : current,
    );
  }

  async function save() {
    if (!validation?.valid || saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      await savePeDailySection(createClient(), reportDate, section.key, validation.rows);
      setDrafts(null);
      onSaved();
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Saving the section failed.");
    } finally {
      setSaving(false);
    }
  }

  const actions = isAdmin && !drafts ? (
    <button
      type="button"
      className="secondary-button"
      aria-label={`Edit ${section.title}`}
      onClick={startEditing}
    >
      Edit
    </button>
  ) : null;

  return (
    <SectionPanel id={`pe-daily-${section.key}`} title={section.title} actions={actions}>
      {drafts && validation ? (
        <SectionEditor
          section={section}
          drafts={drafts}
          validation={validation}
          saving={saving}
          saveError={saveError}
          onChange={updateDraft}
          onAdd={() => setDrafts((current) => (current ? [...current, emptyDraftRow(section)] : current))}
          onRemove={(index) => setDrafts((current) => (current ? current.filter((_, i) => i !== index) : current))}
          onCancel={cancel}
          onSave={() => void save()}
        />
      ) : (
        <DataTable
          label={section.title}
          columns={manualColumns(section)}
          rows={rows}
          rowKey={(_row, index) => String(index)}
        />
      )}
      {children}
    </SectionPanel>
  );
}
