"use client";

import { useState, type FormEvent } from "react";

const MAX_LENGTH = 60;

export function WorkspaceTag({
  value,
  onSave,
}: {
  value?: string;
  onSave?: (tag: string | null) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!value && !onSave) return null;

  function startEditing() {
    setDraft(value ?? "");
    setError(null);
    setEditing(true);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!onSave || saving) return;
    setSaving(true);
    setError(null);
    try {
      await onSave(draft.trim() || null);
      setEditing(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Saving the tag failed.");
    } finally {
      setSaving(false);
    }
  }

  if (editing) {
    return (
      <form className="workspace-tag-editor" onSubmit={handleSubmit}>
        <label htmlFor="workspace-tag-input" className="visually-hidden">Tag</label>
        <input
          id="workspace-tag-input"
          value={draft}
          maxLength={MAX_LENGTH}
          placeholder="e.g. October/November"
          onChange={(event) => setDraft(event.target.value)}
          disabled={saving}
          autoFocus
        />
        <button type="submit" className="primary-button" disabled={saving}>
          {saving ? "Saving" : "Save tag"}
        </button>
        <button
          type="button"
          className="secondary-button"
          onClick={() => setEditing(false)}
          disabled={saving}
        >
          Cancel
        </button>
        {error ? <p className="form-error" role="alert">{error}</p> : null}
      </form>
    );
  }

  return (
    <div className="workspace-tag-display">
      {value ? <span className="workspace-tag">{value}</span> : null}
      {onSave ? (
        <button type="button" className="secondary-button workspace-tag-edit" onClick={startEditing}>
          {value ? "Edit tag" : "Add tag"}
        </button>
      ) : null}
    </div>
  );
}
