/**
 * Spike: can we connect to Supabase, and is pgvector enabled?
 * Bun's built-in SQL client — no pg driver dependency needed.
 */

import { SQL } from "bun";

const sql = new SQL(process.env.DATABASE_URL!);

const [{ version }] = await sql`select version()`;
console.log("Connected:", version.split(",")[0]);

const extensions = await sql`select extname from pg_extension where extname = 'vector'`;
console.log(extensions.length > 0 ? "pgvector: enabled" : "pgvector: NOT enabled");

await sql.end();
