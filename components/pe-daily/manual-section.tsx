import type { ReactNode } from "react";
import { displayManualValue, type SectionDefinition } from "@/lib/pe-daily/sections";
import type { ManualRow } from "@/lib/pe-daily/types";
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

export function ManualSection({ section, rows, children }: ManualSectionProps) {
  return (
    <SectionPanel id={`pe-daily-${section.key}`} title={section.title}>
      <DataTable
        label={section.title}
        columns={manualColumns(section)}
        rows={rows}
        rowKey={(_row, index) => String(index)}
      />
      {children}
    </SectionPanel>
  );
}
