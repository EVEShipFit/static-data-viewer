import type { LoadState } from "../app/loadState";
import { phaseLabel } from "../app/loadState";
import styles from "./AppLayout.module.css";

export interface LanguageOption {
  code: string;
  name: string;
}

export function AppHeader(props: {
  load: LoadState;
  selectedLang: string;
  languages: LanguageOption[];
  onLanguageChange: (code: string) => void;
  autoLoadLatestSde: boolean;
  onAutoLoadLatestSde: (enabled: boolean) => void;
}) {
  return (
    <header className={styles.header}>
      <div>
        <h1 className={styles.headerTitle}>EVE SDE viewer</h1>
        <p className={styles.headerDesc}>
          Client-side DuckDB viewer for EVE Online&apos;s Static Data export.
        </p>
      </div>
      <div className={styles.toolbar}>
        <label className={styles.langLabel}>
          Language
          <select
            className={styles.langSelect}
            value={props.selectedLang}
            onChange={(e) => props.onLanguageChange(e.target.value)}
            disabled={props.languages.length === 0 || props.load.status === "loading"}
          >
            {props.languages.length === 0 ? (
              <option value="en">English (en)</option>
            ) : (
              props.languages.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.name} ({l.code})
                </option>
              ))
            )}
          </select>
        </label>
        <div className={styles.statusCol}>
          {props.load.status === "loading" && (
            <span className={styles.statusLine}>{phaseLabel(props.load.phase)}</span>
          )}
          {props.load.status === "error" && (
            <span className={styles.statusError}>{props.load.message}</span>
          )}
          <button
            type="button"
            className={styles.autoLoadToggle}
            onClick={() => props.onAutoLoadLatestSde(!props.autoLoadLatestSde)}
            title="Toggle splash auto-load behavior"
          >
            Auto-load: {props.autoLoadLatestSde ? "on" : "off"}
          </button>
        </div>
      </div>
    </header>
  );
}
