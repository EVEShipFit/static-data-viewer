import styles from "./AppLayout.module.css";
import { SidebarTables } from "./SidebarTables";

export function ReferenceSidebar(props: {
  tablesReady: boolean;
  tables: string[];
  onSelectTable: (table: string) => void;
  canLoadMapTables: boolean;
  onLoadMapTables: () => void;
}) {
  return (
    <aside className={styles.aside}>
      <div>
        <h2 className={styles.refHeading}>Reference</h2>
        <ul className={styles.refList}>
          <li>
            <a href="https://developers.eveonline.com/static-data">EVE static data</a>
          </li>
          <li>
            <a href="https://duckdb.org/docs/stable/clients/wasm/overview">DuckDB-Wasm</a>
          </li>
        </ul>
      </div>
      <SidebarTables
        tablesReady={props.tablesReady}
        tables={props.tables}
        onSelectTable={props.onSelectTable}
      />
      {props.canLoadMapTables ? (
        <button
          type="button"
          className={styles.loadMapBtn}
          onClick={props.onLoadMapTables}
        >
          Load map tables now
        </button>
      ) : null}
    </aside>
  );
}
