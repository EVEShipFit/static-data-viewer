# EVE Static Data Viewer

Browser-based SQL explorer for EVE Online's Static Data Export (SDE), powered by DuckDB-Wasm.

This app downloads the official JSONL zip, materializes it into DuckDB tables in-browser, and gives you a lightweight notebook UI for querying and sharing SQL cells.

## What this project does

- Loads the latest SDE into DuckDB, in your browser.
- Run ad-hoc SQL in notebook-style cells.
- Persists cells.
- Share cells with others.

## Features

- **Language flattening** for translated fields (`en/de/fr/...` objects -> selected locale value).
- **Notebook UX**
  - Add / rename / reorder / delete cells.
  - `Ctrl+Enter` (or `Cmd+Enter`) runs current cell.
  - Clickable result values with collapsed/expanded long text.
- **Share links for cells**
  - Share button copies a URL containing encoded `{title, sql}`.
  - Opening the link imports the cell into local storage.
- **Loaded tables sidebar**
  - Click table name to create a query cell (`SELECT * ... LIMIT 10`).
- **Incremental loading**
  - Option on splash to include `map*` at initial load
  - Later "Load map tables now" loads only `map*` incrementally

## Tech stack

- React + TypeScript + Vite
- DuckDB-Wasm (`@duckdb/duckdb-wasm`)
- zip.js (`@zip.js/zip.js`) for in-browser zip reading

## Local development

### Prerequisites

- Node.js 20+
- npm

### Install

```bash
npm install
```

### Run dev server

```bash
npm run dev
```

### Build

```bash
npm run build
```
