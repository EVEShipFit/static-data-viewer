import styles from "./SidebarTables.module.css";

export function SidebarTables({
  tablesReady,
  tables,
  onSelectTable,
}: {
  tablesReady: boolean;
  tables: string[];
  onSelectTable: (table: string) => void;
}) {
  return (
    <div className={styles.wrap}>
      <h2 className={styles.heading}>Loaded tables</h2>
      {!tablesReady ? (
        <p className={styles.placeholder}>
          Load the SDE to list materialized <code>sde.*</code> tables here.
        </p>
      ) : (
        <div className={styles.tableList}>
          {tables.map((t) => (
            <button
              key={t}
              type="button"
              className={styles.tableButton}
              title={`Open quick query for ${t}`}
              onClick={() => onSelectTable(t)}
            >
              {t}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
