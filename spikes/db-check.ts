/**
 * Spike: can we connect to Supabase, is pgvector enabled, and does the schema exist?
 * Bun's built-in SQL client — no pg driver dependency needed.
 */

import { SQL } from "bun";

const sql = new SQL(process.env.DATABASE_URL!);

const [{ version }] = await sql`select version()`;
console.log("Connected:", version.split(",")[0]);

const extensions = await sql`select extname from pg_extension where extname = 'vector'`;
console.log(extensions.length > 0 ? "pgvector: enabled" : "pgvector: NOT enabled");

const tables = await sql`
  select table_name from information_schema.tables
  where table_schema = 'public' and table_type = 'BASE TABLE'
  order by table_name
`;
console.log("Tables:", tables.map((t: { table_name: string }) => t.table_name).join(", "));

const indexes = await sql`
  select indexname from pg_indexes where tablename = 'chunks' order by indexname
`;
console.log("chunks indexes:", indexes.map((i: { indexname: string }) => i.indexname).join(", "));

await sql.end();
