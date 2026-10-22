import { formatCount, parseCount } from "./format";
import type { ManualFieldValue, ManualRow, SectionKey } from "./types";

export type FieldType = "text" | "count";

export interface SectionField {
  key: string;
  label: string;
  type: FieldType;
  required?: boolean;
}

export interface SectionDefinition {
  key: SectionKey;
  title: string;
  fields: SectionField[];
}

export type DraftRow = Record<string, string>;

export interface DraftValidation {
  rows: ManualRow[];
  errors: Array<Record<string, string>>;
  valid: boolean;
}

export const MAX_TEXT_LENGTH = 2000;

const text = (key: string, label: string, required = false): SectionField => ({
  key,
  label,
  type: "text",
  required,
});

const count = (key: string, label: string): SectionField => ({ key, label, type: "count" });

export const SECTIONS: Record<SectionKey, SectionDefinition> = {
  tx_prov: {
    key: "tx_prov",
    title: "Promos – TX_PROV",
    fields: [
      text("promo", "Promo Name", true),
      count("last_week", "Last Week Count"),
      count("day_before", "Day Before Count"),
      count("yesterday", "Yesterday Count"),
    ],
  },
  actions: {
    key: "actions",
    title: "Actions",
    fields: [text("action", "Action", true), text("status", "Status")],
  },
  offer_sheet: {
    key: "offer_sheet",
    title: "Offer Sheet Tool",
    fields: [
      text("promo", "Promo Name", true),
      text("owner", "Owner"),
      text("on_gui", "On GUI"),
      text("utilized_business", "Utilized Business"),
    ],
  },
  data_lake: {
    key: "data_lake",
    title: "Data Lake",
    fields: [text("file_path", "File Path", true)],
  },
  it_cases: {
    key: "it_cases",
    title: "IT First Line Cases",
    fields: [
      text("case", "Case", true),
      text("promo", "Promo Name"),
      text("first_line", "Is it 1st line?"),
      text("feedback", "Feedback"),
    ],
  },
  grafana: {
    key: "grafana",
    title: "Grafana",
    fields: [text("issue", "Issue", true), text("server", "Server"), text("feedback", "Feedback")],
  },
};

function draftValue(draft: DraftRow, field: SectionField): string {
  return (draft[field.key] ?? "").trim();
}

export function validateDraftRows(section: SectionDefinition, drafts: DraftRow[]): DraftValidation {
  const rows: ManualRow[] = [];
  const errors = drafts.map((draft) => {
    const rowErrors: Record<string, string> = {};
    if (section.fields.every((field) => draftValue(draft, field) === "")) return rowErrors;

    const row: ManualRow = {};
    for (const field of section.fields) {
      const value = draftValue(draft, field);
      if (field.type === "count") {
        if (!value) {
          row[field.key] = null;
        } else {
          const parsed = parseCount(value);
          if (parsed === null) rowErrors[field.key] = "Enter a whole number.";
          else row[field.key] = parsed;
        }
        continue;
      }
      if (field.required && !value) {
        rowErrors[field.key] = "Required.";
      } else if (value.length > MAX_TEXT_LENGTH) {
        rowErrors[field.key] = `Must be ${MAX_TEXT_LENGTH.toLocaleString("en-US")} characters or fewer.`;
      }
      row[field.key] = value;
    }
    if (!Object.keys(rowErrors).length) rows.push(row);
    return rowErrors;
  });
  return { rows, errors, valid: errors.every((rowErrors) => !Object.keys(rowErrors).length) };
}

export function toDraftRow(section: SectionDefinition, row: ManualRow): DraftRow {
  return Object.fromEntries(
    section.fields.map((field) => {
      const value = row[field.key];
      return [field.key, value === null || value === undefined ? "" : String(value)];
    }),
  );
}

export function emptyDraftRow(section: SectionDefinition): DraftRow {
  return Object.fromEntries(section.fields.map((field) => [field.key, ""]));
}

export function displayManualValue(field: SectionField, value?: ManualFieldValue): string {
  if (field.type === "count") return formatCount(typeof value === "number" ? value : null);
  if (value === null || value === undefined) return "";
  return String(value);
}
