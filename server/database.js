import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import pg from "pg";
pg.types.setTypeParser(20, (value) => {
  const n = Number(value);
  if (!Number.isSafeInteger(n))
    throw new Error("Money value exceeds safe integer range.");
  return n;
});

export async function database(
  url = process.env.DATABASE_URL,
  file = process.env.DB_FILE || "data/sayinn.sqlite",
  schema,
) {
  let pool, sqlite;
  if (url) {
    if (schema && !/^sayinn_[a-f0-9]{32}$/.test(schema))
      throw new Error("Invalid shop schema");
    pool = new pg.Pool({
      connectionString: url,
      max: schema ? 3 : 10,
      ...(schema ? { options: `-c search_path=${schema}` } : {}),
    });
    if (schema) await pool.query(`CREATE SCHEMA IF NOT EXISTS "${schema}"`);
  } else {
    mkdirSync("data", { recursive: true });
    sqlite = new DatabaseSync(file);
    sqlite.exec(
      "PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;",
    );
  }
  function adapter(client) {
    return {
      async query(sql, values = []) {
        if (pool) {
          let i = 0;
          return (
            await client.query(
              sql.replace(/\?/g, () => `$${++i}`),
              values,
            )
          ).rows;
        }
        return sqlite.prepare(sql).all(...values);
      },
    };
  }
  const db = adapter(pool);
  // SQLite owns one connection. Queue ALL operations around transactions to
  // prevent async request interleaving inside another request's transaction.
  let tail = Promise.resolve();
  db.transaction = (fn) => {
    const execute = async () => {
      const client = pool ? await pool.connect() : null;
      const tx = adapter(client);
      try {
        if (pool) await client.query("BEGIN");
        else sqlite.exec("BEGIN IMMEDIATE");
        const result = await fn(tx);
        if (pool) await client.query("COMMIT");
        else sqlite.exec("COMMIT");
        return result;
      } catch (e) {
        if (pool) await client.query("ROLLBACK");
        else sqlite.exec("ROLLBACK");
        throw e;
      } finally {
        client?.release();
      }
    };
    if (pool) return execute();
    const result = tail.then(execute);
    tail = result.catch(() => {});
    return result;
  };
  if (!pool) {
    const raw = db.query;
    db.query = (...args) => {
      const result = tail.then(() => raw(...args));
      tail = result.catch(() => {});
      return result;
    };
  }
  db.close = async () => (pool ? pool.end() : sqlite.close());
  const statements = [
    "CREATE TABLE IF NOT EXISTS membership_decisions (user_id TEXT PRIMARY KEY, status TEXT NOT NULL, actor TEXT NOT NULL, decided TEXT NOT NULL, requested TEXT NOT NULL)",
    "CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, name TEXT NOT NULL, username TEXT UNIQUE NOT NULL, password TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('OWNER','CASHIER')), active INTEGER NOT NULL DEFAULT 1)",
    "CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), expires TEXT NOT NULL)",
    "CREATE TABLE IF NOT EXISTS settings (id INTEGER PRIMARY KEY, value TEXT NOT NULL)",
    "CREATE TABLE IF NOT EXISTS products (id TEXT PRIMARY KEY, name TEXT NOT NULL, variant TEXT NOT NULL, sku TEXT UNIQUE NOT NULL, category TEXT NOT NULL, price INTEGER NOT NULL CHECK(price>=0), cost INTEGER NOT NULL CHECK(cost>=0), stock INTEGER NOT NULL CHECK(stock>=0), threshold INTEGER NOT NULL DEFAULT 5, image TEXT NOT NULL, archived INTEGER NOT NULL DEFAULT 0)",
    "CREATE TABLE IF NOT EXISTS customers (id TEXT PRIMARY KEY, name TEXT NOT NULL, phone TEXT NOT NULL, note TEXT NOT NULL)",
    "CREATE TABLE IF NOT EXISTS shifts (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), opened TEXT NOT NULL, closed TEXT, opening INTEGER NOT NULL, counted INTEGER, expected INTEGER, note TEXT)",
    "CREATE UNIQUE INDEX IF NOT EXISTS one_open_shift ON shifts(user_id) WHERE closed IS NULL",
    "CREATE TABLE IF NOT EXISTS sales (id TEXT PRIMARY KEY, receipt TEXT UNIQUE NOT NULL, user_id TEXT NOT NULL REFERENCES users(id), shift_id TEXT NOT NULL REFERENCES shifts(id), customer_id TEXT REFERENCES customers(id), created TEXT NOT NULL, subtotal INTEGER NOT NULL, discount INTEGER NOT NULL, tax INTEGER NOT NULL, total INTEGER NOT NULL, change_amount INTEGER NOT NULL, lines TEXT NOT NULL, payments TEXT NOT NULL, refunds TEXT NOT NULL, idempotency TEXT UNIQUE NOT NULL, request_hash TEXT NOT NULL)",
    "CREATE TABLE IF NOT EXISTS holds (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), label TEXT NOT NULL, lines TEXT NOT NULL, created TEXT NOT NULL)",
    "CREATE TABLE IF NOT EXISTS audit (id TEXT PRIMARY KEY, actor TEXT NOT NULL, action TEXT NOT NULL, record TEXT NOT NULL, details TEXT NOT NULL, created TEXT NOT NULL)",
    "CREATE TABLE IF NOT EXISTS movements (id TEXT PRIMARY KEY, product_id TEXT NOT NULL REFERENCES products(id), delta INTEGER NOT NULL, reason TEXT NOT NULL, created TEXT NOT NULL)",
    "CREATE TABLE IF NOT EXISTS refunds (id TEXT PRIMARY KEY, sale_id TEXT NOT NULL REFERENCES sales(id), shift_id TEXT NOT NULL REFERENCES shifts(id), amount INTEGER NOT NULL CHECK(amount>=0), method TEXT NOT NULL, created TEXT NOT NULL)",
    "CREATE TABLE IF NOT EXISTS sequences (day TEXT PRIMARY KEY, value INTEGER NOT NULL)",
    "CREATE INDEX IF NOT EXISTS sales_created ON sales(created)",
    "CREATE TABLE IF NOT EXISTS category_fields (name TEXT PRIMARY KEY, fields TEXT NOT NULL)",
    "CREATE TABLE IF NOT EXISTS product_fields (product_id TEXT NOT NULL REFERENCES products(id), category TEXT NOT NULL, value TEXT NOT NULL, PRIMARY KEY(product_id,category))",
    "CREATE TABLE IF NOT EXISTS images (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES users(id), purpose TEXT NOT NULL, content TEXT NOT NULL, created TEXT NOT NULL)",
    "CREATE TABLE IF NOT EXISTS member_requests (user_id TEXT PRIMARY KEY REFERENCES users(id), created TEXT NOT NULL)",
    "CREATE TABLE IF NOT EXISTS profiles (user_id TEXT PRIMARY KEY REFERENCES users(id), email TEXT NOT NULL DEFAULT '', phone TEXT NOT NULL DEFAULT '', image TEXT NOT NULL DEFAULT '')",
  ];
  for (const sql of statements)
    await db.query(pool ? sql.replace(/\bINTEGER\b/g, "BIGINT") : sql);
  if (pool) {
    await db.query(
      "CREATE OR REPLACE FUNCTION sayinn_audit_immutable() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Audit rows are insert-only'; END; $$",
    );
    await db.query(
      "CREATE OR REPLACE TRIGGER audit_immutable BEFORE UPDATE OR DELETE ON audit FOR EACH ROW EXECUTE FUNCTION sayinn_audit_immutable()",
    );
  } else {
    sqlite.exec(
      "CREATE TRIGGER IF NOT EXISTS audit_no_update BEFORE UPDATE ON audit BEGIN SELECT RAISE(ABORT, 'Audit rows are insert-only'); END; CREATE TRIGGER IF NOT EXISTS audit_no_delete BEFORE DELETE ON audit BEGIN SELECT RAISE(ABORT, 'Audit rows are insert-only'); END;",
    );
  }
  return db;
}
