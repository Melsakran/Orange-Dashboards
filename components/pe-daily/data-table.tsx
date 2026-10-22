import type { ReactNode } from "react";

export interface Column<T> {
  key: string;
  header: string;
  numeric?: boolean;
  cell: (row: T, index: number) => ReactNode;
}

export function DataTable<T>({
  label,
  columns,
  rows,
  rowKey,
}: {
  label: string;
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T, index: number) => string;
}) {
  if (!rows.length) return <p className="pe-daily-empty">No entries</p>;
  return (
    <div className="pe-daily-table-wrap">
      <table className="pe-daily-table" aria-label={label}>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key} scope="col" className={column.numeric ? "pe-daily-number" : undefined}>
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={rowKey(row, index)}>
              {columns.map((column) => (
                <td key={column.key} className={column.numeric ? "pe-daily-number" : undefined}>
                  {column.cell(row, index)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
