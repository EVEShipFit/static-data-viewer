import { useEffect, useState } from "react";
import type { PersistedCell } from "../notebook/notebookStorage";
import type { SdeLatestInfo } from "../sde/latestMeta";
import { fetchSdeLatestInfo } from "../sde/latestMeta";
import { SPLASH_LANGUAGE_OPTIONS } from "../sde/splashLanguages";
import styles from "./SplashScreen.module.css";

function formatReleaseDate(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

export function SplashScreen(props: {
  selectedLang: string;
  onSelectedLang: (code: string) => void;
  includeMapTables: boolean;
  onIncludeMapTables: (enabled: boolean) => void;
  loading: boolean;
  progressLabel: string | null;
  error: string | null;
  onLoad: () => void;
  sharedCellPreview: PersistedCell | null;
}) {
  const [latest, setLatest] = useState<SdeLatestInfo | null>(null);
  const [metaError, setMetaError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const info = await fetchSdeLatestInfo();
      if (!cancelled) {
        if (info) setLatest(info);
        else setMetaError(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className={styles.root}>
      <div className={styles.card}>
        <h1 className={styles.title}>EVE SDE viewer</h1>
        <p className={styles.subtitle}>
          Load the official Static Data Export into your browser as DuckDB tables. Choose a
          language for translated fields, then download and materialize the latest JSONL bundle.
        </p>

        <div className={styles.metaBlock}>
          <div className={styles.metaLabel}>Latest SDE (Tranquility)</div>
          {latest ? (
            <div className={styles.metaRow}>
              <span className={styles.metaValue}>Build {latest.buildNumber}</span>
              <span className={styles.metaMuted}>{formatReleaseDate(latest.releaseDate)}</span>
            </div>
          ) : metaError ? (
            <p className={styles.metaMuted}>Could not load version info (network or format).</p>
          ) : (
            <p className={styles.metaMuted}>Checking latest version…</p>
          )}
        </div>

        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor="splash-lang">
            Translation language
          </label>
          <select
            id="splash-lang"
            className={styles.select}
            value={props.selectedLang}
            onChange={(e) => props.onSelectedLang(e.target.value)}
            disabled={props.loading}
          >
            {SPLASH_LANGUAGE_OPTIONS.map((l) => (
              <option key={l.code} value={l.code}>
                {l.name} ({l.code})
              </option>
            ))}
          </select>
        </div>

        <label className={styles.checkboxRow}>
          <input
            type="checkbox"
            checked={props.includeMapTables}
            onChange={(e) => props.onIncludeMapTables(e.target.checked)}
            disabled={props.loading}
          />
          <span>
            Include <code>map*</code> tables (large)
          </span>
        </label>

        {props.sharedCellPreview ? (
          <div className={styles.sharePreview}>
            <div className={styles.metaLabel}>Shared query</div>
            <p className={styles.previewText}>
              A shared query link was opened. Load the SDE first, then the query will be imported
              into your notebook.
            </p>
            <div className={styles.previewTitle}>{props.sharedCellPreview.title}</div>
            <pre className={styles.previewSql}>{props.sharedCellPreview.sql}</pre>
          </div>
        ) : null}

        <button
          type="button"
          className={styles.primary}
          disabled={props.loading}
          onClick={() => props.onLoad()}
        >
          {props.loading ? "Loading…" : "Load SDE into browser"}
        </button>

        {props.loading && props.progressLabel ? (
          <p className={styles.progressLine}>{props.progressLabel}</p>
        ) : null}

        {props.error ? <p className={styles.error}>{props.error}</p> : null}

        <div className={styles.links}>
          <span>Reference</span>
          <ul>
            <li>
              <a href="https://developers.eveonline.com/static-data">EVE static data</a>
            </li>
            <li>
              <a href="https://duckdb.org/docs/stable/clients/wasm/overview">DuckDB-Wasm</a>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
