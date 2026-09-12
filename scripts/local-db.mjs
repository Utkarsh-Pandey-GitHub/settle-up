import EmbeddedPostgres from "embedded-postgres";
import { access } from "node:fs/promises";
const pg = new EmbeddedPostgres({
  databaseDir: "/tmp/settleup-postgres",
  user: "settleup",
  password: "settleup_local",
  port: 55432,
  persistent: true,
  authMethod: "scram-sha-256",
  postgresFlags: ["-h", "127.0.0.1"],
  onLog: () => {},
  onError: (message) => console.error(String(message)),
});
const probe = pg.getPgClient("postgres", "127.0.0.1");
let running = false;
try {
  await probe.connect();
  await probe.query("SELECT 1");
  running = true;
} catch (error) {
  if (error.code !== "ECONNREFUSED") throw error;
} finally {
  await probe.end();
}
if (running) {
  console.log("Local PostgreSQL is already running on 127.0.0.1:55432.");
  process.exit(0);
}
try {
  await access("/tmp/settleup-postgres/PG_VERSION");
} catch (error) {
  if (error.code !== "ENOENT") throw error;
  await pg.initialise();
}
await pg.start();
const client = pg.getPgClient();
await client.connect();
const existing = await client.query(
  "SELECT 1 FROM pg_database WHERE datname = 'settleup'",
);
if (!existing.rows.length) await client.query("CREATE DATABASE settleup");
await client.end();
console.log(
  "Local PostgreSQL ready on 127.0.0.1:55432. Data is in /tmp/settleup-postgres.",
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, async () => {
    await pg.stop();
    process.exit(0);
  });
setInterval(() => {}, 60000);
