const STORAGE_KEY = "sde-viewer-notebook-cells-v1";
const SHARE_HASH_KEY = "shareCell";

export interface PersistedCell {
  id: string;
  title: string;
  sql: string;
}

function newCellId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `cell-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function loadNotebookCells(): PersistedCell[] | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as unknown;
    if (!Array.isArray(data)) return null;
    const out: PersistedCell[] = [];
    for (let i = 0; i < data.length; i++) {
      const row = data[i] as Record<string, unknown>;
      const id = typeof row.id === "string" ? row.id : `cell-${i}`;
      const title =
        typeof row.title === "string" ? row.title : typeof row.title === "number" ? String(row.title) : `Cell ${i + 1}`;
      const sql = typeof row.sql === "string" ? row.sql : "";
      out.push({ id, title, sql });
    }
    return out.length ? out : null;
  } catch {
    return null;
  }
}

export function saveNotebookCells(cells: PersistedCell[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cells));
  } catch {
    /* quota or private mode */
  }
}

function encodeBase64Url(input: string): string {
  const bytes = new TextEncoder().encode(input);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decodeBase64Url(input: string): string {
  const base64 = input.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

export function buildShareUrl(cell: PersistedCell): string {
  const payload = JSON.stringify({ id: cell.id, title: cell.title, sql: cell.sql });
  const encoded = encodeBase64Url(payload);
  const u = new URL(window.location.href);
  u.hash = `${SHARE_HASH_KEY}=${encoded}`;
  return u.toString();
}

export function consumeSharedCellFromHash(): PersistedCell | null {
  try {
    const hash = window.location.hash.startsWith("#")
      ? window.location.hash.slice(1)
      : window.location.hash;
    const params = new URLSearchParams(hash);
    const encoded = params.get(SHARE_HASH_KEY);
    if (!encoded) return null;
    const raw = decodeBase64Url(encoded);
    const parsed = JSON.parse(raw) as { id?: unknown; title?: unknown; sql?: unknown };
    const id = typeof parsed.id === "string" && parsed.id.trim() ? parsed.id : newCellId();
    const title = typeof parsed.title === "string" ? parsed.title : "Shared query";
    const sql = typeof parsed.sql === "string" ? parsed.sql : "";
    const imported: PersistedCell = {
      id,
      title,
      sql,
    };

    const clean = new URL(window.location.href);
    clean.hash = "";
    window.history.replaceState({}, "", clean.toString());
    return imported;
  } catch {
    return null;
  }
}
