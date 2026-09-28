#!/usr/bin/env node
/**
 * Runs the financial-ledger verification suite against a Supabase project,
 * using the Management API SQL endpoint (the service-role path this repo
 * already uses for schema work — see CLAUDE.md).
 *
 *   node scripts/verify-financials.mjs --project <ref>          # verify only
 *   node scripts/verify-financials.mjs --project <ref> --migrate # apply first
 *   node scripts/verify-financials.mjs --project <ref> --seed    # + seed data
 *
 * THE SUITE POSTS AND REVERSES REAL JOURNALS. It must never be pointed at
 * production: it is a destructive workflow test. The project ref in .env is
 * treated as production and refused unless --i-know-this-is-not-production is
 * passed, and even then the script checks the target looks like a scratch
 * database (no more than a handful of loans) before it writes anything.
 *
 * For a purely local run with no Supabase project at all, use
 * `scripts/financial-verify/run.sh`, which does the same thing against a
 * throwaway PostgreSQL database.
 */
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));

const env = Object.fromEntries(
  readFileSync(join(HERE, "../.env"), "utf8")
    .split("\n")
    .filter((line) => line.includes("=") && !line.trim().startsWith("#"))
    .map((line) => [
      line.slice(0, line.indexOf("=")).trim(),
      line.slice(line.indexOf("=") + 1).trim(),
    ]),
);

const token = env.SUPABASE_ACCESS_TOKEN;
if (!token) {
  console.error("Missing SUPABASE_ACCESS_TOKEN in .env — the Management API needs it.");
  process.exit(2);
}

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i === -1 ? null : (args[i + 1] ?? true);
};
const has = (name) => args.includes(name);

const project = flag("--project");
if (!project) {
  console.error("Pass --project <ref>. Use a branch or scratch project, never production.");
  process.exit(2);
}

const productionRef = (env.SUPABASE_PROJECT_ID || "").trim();
if (project === productionRef && !has("--i-know-this-is-not-production")) {
  console.error(
    `Refusing to run: ${project} is the project in .env.\n` +
      "This suite creates loans, posts journals and reverses them. Point it at a\n" +
      "Supabase branch or a scratch project instead.",
  );
  process.exit(2);
}

const sql = async (query) => {
  const res = await fetch(`https://api.supabase.com/v1/projects/${project}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`${res.status} ${body.slice(0, 600)}`);
  try {
    return JSON.parse(body);
  } catch {
    return body;
  }
};

// A scratch database has a handful of rows. Production has a portfolio.
const guardTarget = async () => {
  const [{ loans, journals }] = await sql(
    `select (select count(*) from public.loans) as loans,
            (select count(*) from information_schema.tables
              where table_schema='public' and table_name='financial_transactions') as journals`,
  );
  console.log(`target ${project}: ${loans} loan(s), ledger installed: ${journals > 0 ? "yes" : "no"}`);
  if (Number(loans) > 40 && !has("--i-know-this-is-not-production")) {
    throw new Error(
      `${loans} loans found. That looks like real data, not a scratch database. Aborting.`,
    );
  }
};

const runFile = async (path, label) => {
  process.stdout.write(`  ${label.padEnd(56)}`);
  await sql(readFileSync(path, "utf8"));
  console.log("ok");
};

const main = async () => {
  await guardTarget();

  if (has("--migrate")) {
    const dir = join(HERE, "../supabase/migrations");
    const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
    const base = files.slice(0, 13);
    const financial = files.slice(13);

    console.log("── base migrations ──");
    for (const f of base) await runFile(join(dir, f), f);

    if (has("--seed")) {
      console.log("── seed ──");
      await runFile(join(HERE, "financial-verify/01-seed-production-shape.sql"), "seed");
    }

    console.log("── financial migrations ──");
    for (const f of financial) await runFile(join(dir, f), f);
  } else if (has("--seed")) {
    console.log("── seed ──");
    await runFile(join(HERE, "financial-verify/01-seed-production-shape.sql"), "seed");
  }

  console.log("── verification suite ──");
  await sql(readFileSync(join(HERE, "financial-verify/02-tests.sql"), "utf8"));

  const byArea = await sql(
    `select area, count(*) filter (where passed) as passed,
            count(*) filter (where not passed) as failed
       from _verify_results group by area order by min(seq)`,
  );
  for (const r of byArea) {
    console.log(`  ${r.area.padEnd(20)} ${String(r.passed).padStart(3)} passed  ${r.failed} failed`);
  }

  const failures = await sql(
    `select area, name, coalesce(detail,'') as detail
       from _verify_results where not passed order by seq`,
  );
  if (failures.length) {
    console.log("\nFAILURES");
    for (const f of failures) console.log(`  [${f.area}] ${f.name}\n      ${f.detail}`);
  }

  const health = await sql(`select check_name, subject_ref, detail from public.v_ledger_health`);
  if (health.length) {
    console.log("\nLEDGER HEALTH ISSUES");
    for (const h of health) console.log(`  ${h.check_name}: ${h.subject_ref} — ${h.detail}`);
  }

  const total = byArea.reduce((t, r) => t + Number(r.failed), 0) + health.length;
  console.log(total === 0 ? "\nVERIFICATION PASSED" : `\nVERIFICATION FAILED — ${total} problem(s)`);
  process.exit(total === 0 ? 0 : 1);
};

main().catch((e) => {
  console.error(`\n${e.message}`);
  process.exit(1);
});
