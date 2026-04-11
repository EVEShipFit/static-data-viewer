import type { AsyncDuckDB } from "@duckdb/duckdb-wasm";
import {
  BlobReader,
  type FileEntry,
  Uint8ArrayWriter,
  ZipReader,
} from "@zip.js/zip.js";
import { allocateStableTableIdentifier, baseNameFromZipEntry, internalIngestVfsPath } from "./sqlIdentifier";
import { codesFromLanguageList, parseTranslationLanguagesJsonl } from "./translationLanguages";
import { SPLASH_LANGUAGE_CODES } from "./splashLanguages";
import { transformJsonlForLanguage } from "./transformJsonl";

export type IngestPhase =
  | { kind: "downloading"; loadedBytes: number; totalBytes: number | null }
  | { kind: "listing" }
  | { kind: "ingesting"; current: number; total: number; filename: string };

export interface IngestResult {
  tables: string[];
  skipped: string[];
  languages: { code: string; name: string }[];
}

export async function fetchZipBuffer(
  url: string,
  onProgress: (loaded: number, total: number | null) => void,
): Promise<ArrayBuffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed (${res.status}): ${res.statusText}`);
  const total = res.headers.get("content-length")
    ? Number(res.headers.get("content-length"))
    : null;
  const body = res.body;
  if (!body) {
    const buf = await res.arrayBuffer();
    onProgress(buf.byteLength, total);
    return buf;
  }
  const chunks: Uint8Array[] = [];
  let loaded = 0;
  const reader = body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      loaded += value.byteLength;
      onProgress(loaded, total);
    }
  }
  const out = new Uint8Array(loaded);
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.length;
  }
  return out.buffer;
}

function leafName(filename: string): string {
  return (filename.replace(/\\/g, "/").split("/").pop() ?? "").toLowerCase();
}

async function loadLanguageMetadata(
  jsonlEntries: FileEntry[],
): Promise<{ languages: { code: string; name: string }[]; langCodes: Set<string> }> {
  const tl = jsonlEntries.find((e) => leafName(e.filename) === "translationlanguages.jsonl");
  if (!tl) {
    const languages = SPLASH_LANGUAGE_CODES.map((c) => ({ code: c, name: c }));
    return { languages, langCodes: new Set<string>(SPLASH_LANGUAGE_CODES) };
  }
  const writer = new Uint8ArrayWriter();
  const bytes = await tl.getData(writer);
  const languages = parseTranslationLanguagesJsonl(bytes);
  if (languages.length === 0) {
    const fb = SPLASH_LANGUAGE_CODES.map((c) => ({ code: c, name: c }));
    return { languages: fb, langCodes: new Set<string>(SPLASH_LANGUAGE_CODES) };
  }
  return { languages, langCodes: codesFromLanguageList(languages) };
}

export interface IngestBufferOptions {
  language: string;
  includeMapTables: boolean;
  onPhase: (p: IngestPhase) => void;
}

type IngestMode = "full" | "map-only";

async function listExistingSdeTableNamesLower(conn: Awaited<ReturnType<AsyncDuckDB["connect"]>>): Promise<Set<string>> {
  const table = await conn.query(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = 'sde'`,
  );
  return new Set(table.toArray().map((r) => String((r as Record<string, unknown>).table_name).toLowerCase()));
}

async function listSdeQualifiedTables(conn: Awaited<ReturnType<AsyncDuckDB["connect"]>>): Promise<string[]> {
  const table = await conn.query(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = 'sde' ORDER BY table_name`,
  );
  return table.toArray().map((r) => `sde.${String((r as Record<string, unknown>).table_name)}`);
}

async function ingestFromZip(
  db: AsyncDuckDB,
  buf: ArrayBuffer,
  {
    language,
    includeMapTables,
    onPhase,
    mode,
  }: IngestBufferOptions & { mode: IngestMode },
): Promise<IngestResult> {
  onPhase({ kind: "listing" });
  const reader = new ZipReader(new BlobReader(new Blob([buf])));
  const entries = await reader.getEntries({ filenameEncoding: "utf-8" });

  const jsonlEntries = entries.filter(
    (e): e is FileEntry =>
      !e.directory && e.filename.toLowerCase().endsWith(".jsonl"),
  );

  const { languages, langCodes } = await loadLanguageMetadata(jsonlEntries);
  const filtered =
    mode === "map-only"
      ? jsonlEntries.filter((e) => leafName(e.filename).startsWith("map"))
      : includeMapTables
        ? jsonlEntries
        : jsonlEntries.filter((e) => !leafName(e.filename).startsWith("map"));

  const conn = await db.connect();
  const skipped: string[] = [];
  const usedTableNames = new Set<string>();

  try {
    if (mode === "full") {
      await conn.query(`DROP SCHEMA IF EXISTS sde CASCADE`);
      await conn.query(`CREATE SCHEMA sde`);
    } else {
      await conn.query(`CREATE SCHEMA IF NOT EXISTS sde`);
      const existing = await listExistingSdeTableNamesLower(conn);
      for (const e of existing) usedTableNames.add(e);
    }

    let i = 0;
    for (const entry of filtered) {
      i += 1;
      const filename = entry.filename;
      onPhase({ kind: "ingesting", current: i, total: filtered.length, filename });

      const writer = new Uint8ArrayWriter();
      let bytes = await entry.getData(writer);
      const vfsPath = internalIngestVfsPath(i);
      const base = baseNameFromZipEntry(filename);
      const tableId = allocateStableTableIdentifier(base, usedTableNames);
      const qualified = `sde.${tableId}`;

      const isTranslationTable = leafName(filename) === "translationlanguages.jsonl";
      if (!isTranslationTable && langCodes.size > 0) {
        bytes = transformJsonlForLanguage(bytes, language, langCodes) as typeof bytes;
      }

      await db.registerFileBuffer(vfsPath, bytes);
      try {
        await conn.query(
          `CREATE TABLE ${qualified} AS SELECT * FROM read_ndjson_auto('${vfsPath}')`,
        );
      } catch (e) {
        skipped.push(filename);
        console.warn(`Skipped ${filename}:`, e);
      } finally {
        await db.dropFile(vfsPath);
      }
    }

    const tables = await listSdeQualifiedTables(conn);
    return { tables, skipped, languages };
  } finally {
    await conn.close();
    await reader.close();
  }
}

export async function ingestSdeFromZipBuffer(
  db: AsyncDuckDB,
  buf: ArrayBuffer,
  options: IngestBufferOptions,
): Promise<IngestResult> {
  return ingestFromZip(db, buf, { ...options, mode: "full" });
}

export async function ingestMapTablesIntoExistingFromZipBuffer(
  db: AsyncDuckDB,
  buf: ArrayBuffer,
  options: Pick<IngestBufferOptions, "language" | "onPhase">,
): Promise<IngestResult> {
  return ingestFromZip(db, buf, {
    language: options.language,
    includeMapTables: true,
    onPhase: options.onPhase,
    mode: "map-only",
  });
}

export async function ingestSdeFromZipUrl(
  db: AsyncDuckDB,
  zipUrl: string,
  language: string,
  includeMapTables: boolean,
  onPhase: (p: IngestPhase) => void,
): Promise<IngestResult> {
  const buf = await fetchZipBuffer(zipUrl, (loaded, total) => {
    onPhase({ kind: "downloading", loadedBytes: loaded, totalBytes: total });
  });
  return ingestSdeFromZipBuffer(db, buf, { language, includeMapTables, onPhase });
}
