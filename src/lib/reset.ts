import { DatabaseSync } from "node:sqlite";
import { resolve } from "node:path";

const DB_PATH = resolve(process.env.DB_PATH ?? "./fund.db");
const FUND_CENTS = Math.round(Number(process.env.FUND_USD ?? 100) * 100);

const d = new DatabaseSync(DB_PATH);
d.exec("PRAGMA journal_mode = WAL;");
for (const t of ["awards", "messages", "participants", "fund"]) {
  d.exec(`DROP TABLE IF EXISTS ${t};`);
}
console.log(`Wiped ${DB_PATH}. Fund will re-initialize to $${(FUND_CENTS / 100).toFixed(2)} on next run.`);
d.close();
