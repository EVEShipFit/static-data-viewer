import * as duckdb from "@duckdb/duckdb-wasm";

let dbInstance: duckdb.AsyncDuckDB | null = null;

export async function getDuckdb(): Promise<duckdb.AsyncDuckDB> {
  if (dbInstance) return dbInstance;

  const bundles = duckdb.getJsDelivrBundles();
  const bundle = await duckdb.selectBundle(bundles);
  const workerUrl = bundle.mainWorker ?? bundle.mainModule;
  const worker = await duckdb.createWorker(workerUrl);
  const logger = new duckdb.ConsoleLogger();
  const db = new duckdb.AsyncDuckDB(logger, worker);
  await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
  await db.open({ path: ":memory:" });

  dbInstance = db;
  return db;
}

export async function resetDuckdb(): Promise<void> {
  if (dbInstance) {
    await dbInstance.terminate();
    dbInstance = null;
  }
}
