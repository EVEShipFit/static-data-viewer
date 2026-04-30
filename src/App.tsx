import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AsyncDuckDBConnection } from "@duckdb/duckdb-wasm";
import type { LoadState } from "./app/loadState";
import { phaseLabel } from "./app/loadState";
import { AppHeader } from "./components/AppHeader";
import layout from "./components/AppLayout.module.css";
import { Notebook, type NotebookTemplateCell } from "./components/Notebook";
import { ReferenceSidebar } from "./components/ReferenceSidebar";
import { SplashScreen } from "./components/SplashScreen";
import { SDE_JSONL_ZIP_URL } from "./constants";
import { previewSharedCellFromHash } from "./notebook/notebookStorage";
import {
  fetchZipBuffer,
  ingestMapTablesIntoExistingFromZipBuffer,
  ingestSdeFromZipBuffer,
} from "./sde/ingestSde";
import { buildVersionedSdeZipUrl, fetchSdeLatestInfo } from "./sde/latestMeta";

const AUTO_LOAD_SDE_KEY = "sde-viewer-auto-load-latest-v1";

function loadAutoLoadPreference(): boolean {
  try {
    return localStorage.getItem(AUTO_LOAD_SDE_KEY) === "1";
  } catch {
    return false;
  }
}

export default function App() {
  const [appPhase, setAppPhase] = useState<"splash" | "app">("splash");
  const [load, setLoad] = useState<LoadState>({ status: "idle" });
  const [conn, setConn] = useState<AsyncDuckDBConnection | null>(null);
  const [languages, setLanguages] = useState<{ code: string; name: string }[]>([]);
  const [selectedLang, setSelectedLang] = useState("en");
  const [includeMapTables, setIncludeMapTables] = useState(false);
  const [autoLoadLatestSde, setAutoLoadLatestSde] = useState(loadAutoLoadPreference);
  const [activeIncludeMapTables, setActiveIncludeMapTables] = useState(false);
  const [templateCell, setTemplateCell] = useState<NotebookTemplateCell | null>(null);

  const connRef = useRef<AsyncDuckDBConnection | null>(null);
  const zipBufRef = useRef<ArrayBuffer | null>(null);
  const loadStatusRef = useRef<LoadState["status"]>("idle");
  const autoLoadAttemptedRef = useRef(false);

  useEffect(() => {
    connRef.current = conn;
  }, [conn]);

  useEffect(() => {
    loadStatusRef.current = load.status;
  }, [load.status]);

  const selectLangValue = useMemo(() => {
    if (languages.length === 0) return "en";
    if (languages.some((l) => l.code === selectedLang)) return selectedLang;
    return languages.find((l) => l.code === "en")?.code ?? languages[0]!.code;
  }, [languages, selectedLang]);

  const sharedCellPreview = useMemo(() => previewSharedCellFromHash(), []);

  useEffect(() => {
    return () => {
      void (async () => {
        await connRef.current?.close().catch(() => {});
        const duck = await import("./duckdb/initDuckdb");
        await duck.resetDuckdb();
      })();
    };
  }, []);

  const runIngestFromBuffer = useCallback(
    async (buf: ArrayBuffer, language: string, includeMaps: boolean) => {
    const { getDuckdb } = await import("./duckdb/initDuckdb");
    const db = await getDuckdb();
    const { tables, skipped, languages: langs } = await ingestSdeFromZipBuffer(db, buf, {
      language,
      includeMapTables: includeMaps,
      onPhase: (phase) => setLoad({ status: "loading", phase }),
    });
    const c = await db.connect();
    if (connRef.current) await connRef.current.close();
    setConn(c);
    setLanguages(langs);
    const valid = langs.some((l) => l.code === language);
    const next =
      valid ? language : (langs.find((l) => l.code === "en")?.code ?? langs[0]?.code ?? "en");
    if (next !== language) setSelectedLang(next);
    setActiveIncludeMapTables(includeMaps);
    setLoad({ status: "ready", tables, skipped: skipped.length });
  }, []);

  const loadSde = useCallback(async () => {
    setLoad({ status: "loading", phase: { kind: "downloading", loadedBytes: 0, totalBytes: null } });
    try {
      const latest = await fetchSdeLatestInfo();
      const zipUrl = latest ? buildVersionedSdeZipUrl(latest.buildNumber) : SDE_JSONL_ZIP_URL;
      const buf = await fetchZipBuffer(zipUrl, (loaded, total) => {
        setLoad({ status: "loading", phase: { kind: "downloading", loadedBytes: loaded, totalBytes: total } });
      });
      zipBufRef.current = buf;
      await runIngestFromBuffer(buf, selectedLang, includeMapTables);
      setAppPhase("app");
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setLoad({ status: "error", message });
      if (connRef.current) {
        await connRef.current.close().catch(() => {});
        setConn(null);
      }
    }
  }, [includeMapTables, selectedLang, runIngestFromBuffer]);

  const onAutoLoadLatestSde = useCallback((enabled: boolean) => {
    setAutoLoadLatestSde(enabled);
    try {
      localStorage.setItem(AUTO_LOAD_SDE_KEY, enabled ? "1" : "0");
    } catch {
      /* ignore storage failures */
    }
  }, []);

  useEffect(() => {
    if (!autoLoadLatestSde) return;
    if (appPhase !== "splash") return;
    if (load.status !== "idle") return;
    if (autoLoadAttemptedRef.current) return;
    autoLoadAttemptedRef.current = true;
    void loadSde();
  }, [appPhase, autoLoadLatestSde, load.status, loadSde]);

  const onLanguageChange = useCallback(
    async (code: string) => {
      setSelectedLang(code);
      const buf = zipBufRef.current;
      if (!buf || loadStatusRef.current !== "ready") return;
      setLoad({ status: "loading", phase: { kind: "listing" } });
      try {
        await runIngestFromBuffer(buf, code, activeIncludeMapTables);
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        setLoad({ status: "error", message });
      }
    },
    [activeIncludeMapTables, runIngestFromBuffer],
  );

  const onLoadMapTables = useCallback(async () => {
    const buf = zipBufRef.current;
    if (!buf || loadStatusRef.current !== "ready") return;
    setLoad({ status: "loading", phase: { kind: "listing" } });
    try {
      const { getDuckdb } = await import("./duckdb/initDuckdb");
      const db = await getDuckdb();
      const result = await ingestMapTablesIntoExistingFromZipBuffer(db, buf, {
        language: selectedLang,
        onPhase: (phase) => setLoad({ status: "loading", phase }),
      });
      setLanguages(result.languages);
      setActiveIncludeMapTables(true);
      setIncludeMapTables(true);
      setLoad({ status: "ready", tables: result.tables, skipped: result.skipped.length });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setLoad({ status: "error", message });
    }
  }, [selectedLang]);

  const handleTableSelect = useCallback((table: string) => {
    setTemplateCell({
      key: `${Date.now()}-${table}`,
      title: `Preview ${table}`,
      sql: `SELECT *\nFROM ${table}\nORDER BY _key\nLIMIT 10;`,
    });
  }, []);

  if (appPhase === "splash") {
    return (
      <SplashScreen
        selectedLang={selectedLang}
        onSelectedLang={setSelectedLang}
        includeMapTables={includeMapTables}
        onIncludeMapTables={setIncludeMapTables}
        autoLoadLatestSde={autoLoadLatestSde}
        onAutoLoadLatestSde={onAutoLoadLatestSde}
        loading={load.status === "loading"}
        progressLabel={load.status === "loading" ? phaseLabel(load.phase) : null}
        error={load.status === "error" ? load.message : null}
        onLoad={() => void loadSde()}
        sharedCellPreview={sharedCellPreview}
      />
    );
  }

  return (
    <div className={layout.shell}>
      <AppHeader
        load={load}
        selectedLang={selectLangValue}
        languages={languages}
        onLanguageChange={(code) => void onLanguageChange(code)}
        autoLoadLatestSde={autoLoadLatestSde}
        onAutoLoadLatestSde={onAutoLoadLatestSde}
      />

      <div className={layout.body}>
        <ReferenceSidebar
          tablesReady={load.status === "ready"}
          tables={load.status === "ready" ? load.tables : []}
          onSelectTable={handleTableSelect}
          canLoadMapTables={!activeIncludeMapTables && load.status === "ready"}
          onLoadMapTables={() => void onLoadMapTables()}
        />
        <main className={layout.main}>
          <Notebook conn={conn} templateCell={templateCell} />
        </main>
      </div>
    </div>
  );
}
