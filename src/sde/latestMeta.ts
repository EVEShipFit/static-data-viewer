import { SDE_LATEST_META_URL } from "../constants";

export interface SdeLatestInfo {
  buildNumber: number;
  releaseDate: string;
}

export async function fetchSdeLatestInfo(): Promise<SdeLatestInfo | null> {
  try {
    const res = await fetch(SDE_LATEST_META_URL);
    if (!res.ok) return null;
    const text = (await res.text()).trim();
    const line = text.split(/\r?\n/).find((l) => l.trim().length > 0);
    if (!line) return null;
    const row = JSON.parse(line) as { buildNumber?: unknown; releaseDate?: unknown };
    const buildNumber = typeof row.buildNumber === "number" ? row.buildNumber : Number(row.buildNumber);
    const releaseDate = typeof row.releaseDate === "string" ? row.releaseDate : "";
    if (!Number.isFinite(buildNumber) || !releaseDate) return null;
    return { buildNumber, releaseDate };
  } catch {
    return null;
  }
}

export function buildVersionedSdeZipUrl(buildNumber: number): string {
  return `https://developers.eveonline.com/static-data/tranquility/eve-online-static-data-${buildNumber}-jsonl.zip`;
}
