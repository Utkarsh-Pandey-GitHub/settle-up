import EmbeddedPostgres from "embedded-postgres";
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
await pg.initialise();
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
