import { useCallback, useEffect, useRef, useState } from "react";
import type { AsyncDuckDBConnection } from "@duckdb/duckdb-wasm";
import { arrowTableToTabular, type TabularResult } from "../lib/arrowTable";
import {
  buildShareUrl,
  consumeSharedCellFromHash,
  loadNotebookCells,
  saveNotebookCells,
  type PersistedCell,
} from "../notebook/notebookStorage";
import nb from "./Notebook.module.css";

export type NotebookCellModel = PersistedCell;
export interface NotebookTemplateCell {
  key: string;
  title: string;
  sql: string;
}

function newId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

const defaultSql = `SELECT *
FROM sde.types
ORDER BY _key
LIMIT 10;`;

function defaultCells(): NotebookCellModel[] {
  return [{ id: newId(), title: "List types", sql: defaultSql }];
}

function hydrateCells(): NotebookCellModel[] {
  const stored = loadNotebookCells();
  if (stored && stored.length > 0) return stored;
  return defaultCells();
}

export function Notebook({
  conn,
  templateCell,
}: {
  conn: AsyncDuckDBConnection | null;
  templateCell: NotebookTemplateCell | null;
}) {
  const [cells, setCells] = useState<NotebookCellModel[]>(hydrateCells);
  const [outputs, setOutputs] = useState<
    Record<string, { loading: boolean; startedAt?: number; data?: TabularResult; error?: string }>
  >({});
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const lastTemplateKeyRef = useRef<string | null>(null);
  const cancelRequestedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!toastMessage) return;
    const t = setTimeout(() => setToastMessage(null), 2000);
    return () => clearTimeout(t);
  }, [toastMessage]);

  useEffect(() => {
    const hasRunning = Object.values(outputs).some((state) => state.loading);
    if (!hasRunning) return;
    const t = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(t);
  }, [outputs]);

  useEffect(() => {
    const importFromHash = () => {
      const imported = consumeSharedCellFromHash();
      if (!imported) return;
      setCells((existing) => {
        const sameId = existing.find((cell) => cell.id === imported.id);
        if (!sameId) {
          setToastMessage(`Imported shared cell: ${imported.title}`);
          return [...existing, imported];
        }
        if (sameId.sql === imported.sql) {
          setToastMessage("Shared cell already exists, skipped import.");
          return existing;
        }
        const withNewId = { ...imported, id: newId() };
        setToastMessage(`Imported shared cell as new copy: ${imported.title}`);
        return [...existing, withNewId];
      });
    };

    importFromHash();
    window.addEventListener("hashchange", importFromHash);
    return () => window.removeEventListener("hashchange", importFromHash);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      saveNotebookCells(cells.map(({ id, title, sql }) => ({ id, title, sql })));
    }, 200);
    return () => clearTimeout(t);
  }, [cells]);

  useEffect(() => {
    if (!templateCell) return;
    if (lastTemplateKeyRef.current === templateCell.key) return;
    lastTemplateKeyRef.current = templateCell.key;

    const t = setTimeout(() => {
      setCells((existing) => [
        ...existing,
        {
          id: newId(),
          title: templateCell.title,
          sql: templateCell.sql,
        },
      ]);
      setToastMessage(`Added query cell for ${templateCell.title}`);
    }, 0);

    return () => clearTimeout(t);
  }, [templateCell]);

  const runCell = useCallback(
    async (id: string, sql: string) => {
      if (!conn) return;
      if (outputs[id]?.loading) return;
      setOutputs((o) => ({ ...o, [id]: { loading: true, startedAt: Date.now() } }));
      try {
        const table = await conn.query(sql);
        if (cancelRequestedRef.current.has(id)) {
          setOutputs((o) => ({ ...o, [id]: { loading: false, error: "Query cancelled." } }));
          return;
        }
        const data = arrowTableToTabular(table);
        setOutputs((o) => ({ ...o, [id]: { loading: false, data } }));
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        const cancelled =
          cancelRequestedRef.current.has(id) || /cancel|interrupt|aborted/i.test(message);
        setOutputs((o) => ({
          ...o,
          [id]: { loading: false, error: cancelled ? "Query cancelled." : message },
        }));
      } finally {
        cancelRequestedRef.current.delete(id);
      }
    },
    [conn, outputs],
  );

  const stopCell = useCallback(
    async (id: string) => {
      if (!conn) return;
      if (!outputs[id]?.loading) return;
      cancelRequestedRef.current.add(id);
      await conn.cancelSent().catch(() => {});
    },
    [conn, outputs],
  );

  const moveCell = (from: number, to: number) => {
    if (from === to || from < 0 || to < 0) return;
    setCells((list) => {
      const next = [...list];
      const [removed] = next.splice(from, 1);
      next.splice(to, 0, removed);
      return next;
    });
  };

  const addCell = () => {
    setCells((c) => [
      ...c,
      {
        id: newId(),
        title: `Query #${c.length + 1}`,
        sql: defaultSql,
      },
    ]);
  };

  const shareCell = useCallback(async (cell: NotebookCellModel) => {
    const url = buildShareUrl(cell);
    try {
      await navigator.clipboard.writeText(url);
      setToastMessage("Share link copied to clipboard.");
      return;
    } catch {
      window.prompt("Copy share link:", url);
      setToastMessage("Could not auto-copy. Link opened in prompt.");
    }
  }, []);

  const deleteCell = (id: string) => {
    setCells((c) => c.filter((row) => row.id !== id));
    setOutputs((o) => {
      const next = { ...o };
      delete next[id];
      return next;
    });
  };

  const updateCell = (id: string, patch: Partial<Pick<NotebookCellModel, "title" | "sql">>) => {
    setCells((rows) => rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };

  return (
    <div className={nb.root}>
      {cells.map((cell, index) => (
        <section
          key={cell.id}
          className={nb.cell}
          onDragOver={(e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
          }}
          onDrop={(e) => {
            e.preventDefault();
            const from = Number(e.dataTransfer.getData("text/plain"));
            if (Number.isNaN(from)) return;
            moveCell(from, index);
          }}
        >
          <div className={nb.cellHeader}>
            <span
              draggable
              className={nb.dragHandle}
              title="Drag to reorder"
              onDragStart={(e) => {
                e.dataTransfer.setData("text/plain", String(index));
                e.dataTransfer.effectAllowed = "move";
              }}
            >
              ⋮⋮
            </span>
            <input
              type="text"
              className={nb.titleInput}
              value={cell.title}
              aria-label="Cell title"
              onChange={(e) => updateCell(cell.id, { title: e.target.value })}
            />
            <div className={nb.headerActions}>
              <button
                type="button"
                className={nb.btnGhost}
                title="Copy share link for this cell"
                onClick={() => void shareCell(cell)}
              >
                Share
              </button>
              <button
                type="button"
                className={nb.btnGhost}
                title="Delete cell"
                onClick={() => deleteCell(cell.id)}
              >
                Delete
              </button>
              <button
                type="button"
                className={`${nb.btnRun} ${outputs[cell.id]?.loading ? nb.btnStop : ""}`}
                disabled={!conn}
                title={outputs[cell.id]?.loading ? "Stop running query" : "Run query (Ctrl+Enter)"}
                onClick={() =>
                  outputs[cell.id]?.loading
                    ? void stopCell(cell.id)
                    : void runCell(cell.id, cell.sql)
                }
              >
                {outputs[cell.id]?.loading ? (
                  "Stop"
                ) : (
                  <>
                    <span className={nb.runIcon} aria-hidden="true">
                      ▶
                    </span>
                    Run
                    <span className={nb.runHint} aria-hidden="true">
                      Ctrl+Enter
                    </span>
                  </>
                )}
              </button>
            </div>
          </div>
          <textarea
            className={nb.sqlArea}
            value={cell.sql}
            spellCheck={false}
            onChange={(e) => updateCell(cell.id, { sql: e.target.value })}
            onKeyDown={(e) => {
              if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                e.preventDefault();
                void runCell(cell.id, cell.sql);
              }
            }}
          />
          <ResultBlock state={outputs[cell.id]} nowMs={nowMs} />
        </section>
      ))}
      <button type="button" className={nb.addCell} onClick={addCell}>
        + Add cell
      </button>
      {toastMessage ? (
        <div className={nb.toast} role="status" aria-live="polite">
          {toastMessage}
        </div>
      ) : null}
    </div>
  );
}

function ResultBlock({
  state,
  nowMs,
}: {
  state?: { loading: boolean; startedAt?: number; data?: TabularResult; error?: string };
  nowMs: number;
}) {
  if (!state) {
    return <div className={nb.hint}>Run the cell to see results.</div>;
  }
  if (state.loading) {
    const elapsedSeconds =
      typeof state.startedAt === "number" ? Math.max(0, Math.floor((nowMs - state.startedAt) / 1000)) : 0;
    return <div className={nb.hint}>Running… {elapsedSeconds}s</div>;
  }
  if (state.error) {
    return <pre className={nb.errorPre}>{state.error}</pre>;
  }
  if (!state.data || state.data.rows.length === 0) {
    return <div className={nb.hint}>No rows.</div>;
  }

  const { columns, rows } = state.data;
  const maxRows = 500;
  const shown = rows.slice(0, maxRows);

  return (
    <div className={nb.resultScroll}>
      <table className={nb.table}>
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c} className={nb.th}>
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {shown.map((row, ri) => (
            <tr key={ri}>
              {columns.map((c) => (
                <td key={c} className={nb.td}>
                  <ExpandableCellText key={`${ri}-${c}`} text={formatCell(row[c])} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > maxRows && (
        <div className={nb.rowCap}>
          Showing first {maxRows} of {rows.length} rows.
        </div>
      )}
    </div>
  );
}

function ExpandableCellText({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  if (!text) return null;
  return (
    <button
      type="button"
      title={expanded ? "Click to collapse" : "Click to show full text"}
      onClick={() => setExpanded((e) => !e)}
      className={expanded ? nb.expanded : nb.collapsed}
    >
      {text}
    </button>
  );
}

function formatCell(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "bigint") return v.toString();
  if (typeof v === "object") {
    try {
      return JSON.stringify(v, (_key, x) =>
        typeof x === "bigint" ? x.toString() : x,
      );
    } catch {
      return String(v);
    }
  }
  return String(v);
}
