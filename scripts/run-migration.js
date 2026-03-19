/**
 * Run SQL migration against Supabase PostgreSQL database.
 * Usage: node scripts/run-migration.js
 */
const { Client } = require("pg");
const fs = require("fs");
const path = require("path");

async function main() {
  // Use session pooler for DDL support
  const client = new Client({
    host: "aws-0-eu-central-1.pooler.supabase.com",
    port: 5432,
    database: "postgres",
    user: "postgres.gzgvqsmknsmwncoynbkd",
    password: "46R6hxW4fIMG081n",
    ssl: { rejectUnauthorized: false },
  });

  try {
    console.log("Connecting to Supabase PostgreSQL...");
    await client.connect();
    console.log("Connected!");

    const migrationFile = process.argv[2] || "001_initial_schema.sql";
    const sqlPath = path.join(__dirname, "..", "supabase", "migrations", migrationFile);
    const sql = fs.readFileSync(sqlPath, "utf8");

    console.log("Running migration...");
    await client.query(sql);
    console.log("Migration completed successfully!");

    // Verify tables were created
    const { rows } = await client.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_type = 'BASE TABLE'
      ORDER BY table_name;
    `);
    console.log("\nTables created:");
    rows.forEach(r => console.log(`  - ${r.table_name}`));
  } catch (err) {
    console.error("Migration failed:", err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
