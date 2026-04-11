const JSONL_SUFFIX = /\.jsonl$/i;

export function baseNameFromZipEntry(filename: string): string {
  const leaf = filename.replace(/\\/g, "/").split("/").pop() ?? "";
  return leaf.replace(JSONL_SUFFIX, "");
}

export function internalIngestVfsPath(sequence: number): string {
  if (!Number.isInteger(sequence) || sequence < 1) throw new Error("invalid ingest sequence");
  return `ingest_${String(sequence).padStart(5, "0")}.ndjson`;
}

export function allocateStableTableIdentifier(
  baseFromFilename: string,
  usedLower: Set<string>,
): string {
  let s = baseFromFilename.replace(/[^A-Za-z0-9_]/g, "_");
  if (!s) s = "t";
  if (/^[0-9]/.test(s)) s = `_${s}`;
  let candidate = s;
  let n = 2;
  while (usedLower.has(candidate.toLowerCase())) {
    candidate = `${s}_${n++}`;
  }
  usedLower.add(candidate.toLowerCase());
  return candidate;
}
