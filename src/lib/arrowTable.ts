import type { Table } from "apache-arrow";

export interface TabularResult {
  columns: string[];
  rows: Record<string, unknown>[];
}

export function arrowTableToTabular(table: Table): TabularResult {
  const columns = table.schema.fields.map((f) => f.name);
  const rows = table.toArray().map((row) => {
    const r: Record<string, unknown> = {};
    for (const c of columns) {
      r[c] = (row as Record<string, unknown>)[c];
    }
    return r;
  });
  return { columns, rows };
}
