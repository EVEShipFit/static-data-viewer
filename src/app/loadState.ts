import type { IngestPhase } from "../sde/ingestSde";

export type LoadState =
  | { status: "idle" }
  | { status: "loading"; phase: IngestPhase }
  | { status: "ready"; tables: string[]; skipped: number }
  | { status: "error"; message: string };

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function phaseLabel(phase: IngestPhase): string {
  switch (phase.kind) {
    case "downloading": {
      const t = phase.totalBytes
        ? `${formatBytes(phase.loadedBytes)} / ${formatBytes(phase.totalBytes)}`
        : formatBytes(phase.loadedBytes);
      return `Downloading archive… ${t}`;
    }
    case "listing":
      return "Reading zip contents…";
    case "ingesting":
      return `Loading ${phase.filename} (${phase.current}/${phase.total})`;
    default:
      return "Working…";
  }
}
