#!/usr/bin/env node
import { readFileSync, writeFileSync, existsSync, statSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { loadBrand, validateBrand, brandPath } from "./lib/brand.mjs";
import { lintText } from "./lib/lint-text.mjs";
import { runVisual } from "./lib/lint-visual.mjs";
import { renderProject } from "./render.mjs";
import { createProject, readMeta, updateMeta } from "./lib/project.mjs";
import { resolveKnowledge } from "./lib/knowledge.mjs";
import { buildSheetRow, rowToCsv } from "./lib/sheet-row.mjs";
import { precheck, buildSchedulePayload, toUtcIso, checkStagger } from "./lib/publish.mjs";

export const COMMANDS = ["lint", "render", "new", "knowledge", "publish-payload", "status", "meta", "sheet-row"];

// keep in sync with the parser specs in handlers; tests/docs.test.mjs checks each flag is accepted
export const FLAGS = {
  lint: ["self-check", "stage", "brand", "project", "brands", "chrome"],
  render: ["project", "brands", "chrome"],
  new: ["brand", "topic", "out", "brands"],
  knowledge: ["brand", "installed"],
  "publish-payload": ["project", "brands", "account", "at", "live", "existing"],
  status: ["project"],
  meta: ["project", "status", "account", "schedule-id", "schedule-at", "tracked"],
  "sheet-row": ["project", "brands"],
};

class Usage extends Error {}

// spec: flag -> "bool" | "value"; required: flags that must be present
function parse(args, spec, required = []) {
  const f = {};
  for (let i = 0; i < args.length; i++) {
    const m = /^--(.+)$/.exec(args[i]);
    if (!m || !(m[1] in spec)) throw new Usage(`unknown argument: ${args[i]}`);
    if (spec[m[1]] === "bool") f[m[1]] = true;
    else {
      if (i + 1 >= args.length) throw new Usage(`--${m[1]} needs a value`);
      f[m[1]] = args[++i];
    }
  }
  for (const r of required) if (f[r] === undefined) throw new Usage(`missing required flag: --${r}`);
  return f;
}

const readJson = (p) => JSON.parse(readFileSync(p, "utf8"));
const needProject = (dir) => { if (!existsSync(join(dir, "meta.json"))) throw new Error(`project not found: ${dir}`); };
// gate: lint-text.json must say passed and be at least as new as the file it checked
function needLint(dir, ref) {
  const lp = join(dir, "lint-text.json");
  const fresh = existsSync(lp) && existsSync(join(dir, ref)) && readJson(lp).passed === true && statSync(lp).mtimeMs >= statSync(join(dir, ref)).mtimeMs;
  if (!fresh) throw new Error(`run lint --stage text first (lint-text.json missing, failed or older than ${ref})`);
}
const BAD_EXISTING = "--existing must be a JSON array of {accountId, scheduleAt}";
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;
const res = (code, data, summary) => ({ code, stdout: JSON.stringify(data, null, 2) + "\n", stderr: summary + "\n" });

const handlers = {
  lint(args) {
    const f = parse(args, { "self-check": "bool", stage: "value", brand: "value", project: "value", brands: "value", chrome: "value" });
    if (f["self-check"]) {
      if (f.brand === undefined) throw new Usage("missing required flag: --brand");
      const { brand, dir } = loadBrand(f.brand);
      const errors = validateBrand(brand, dir);
      return res(errors.length ? 1 : 0, { ok: !errors.length, errors }, errors.length ? `brand check: ${errors.length} error(s)` : "brand check: ok");
    }
    if (f.stage !== "text" && f.stage !== "visual") throw new Usage("lint needs --self-check or --stage text|visual");
    for (const r of ["project", "brands"]) if (f[r] === undefined) throw new Usage(`missing required flag: --${r}`);
    if (f.stage === "visual") {
      const issues = runVisual(f.project, f.brands, f.chrome);
      return res(issues.length ? 1 : 0, { ok: !issues.length, issues }, `visual lint: ${issues.length} issue(s)`);
    }
    const copy = readJson(join(f.project, "copy.json"));
    if (!copy || typeof copy !== "object" || Array.isArray(copy)) throw new Error("copy.json must be an object");
    const { brand, dir } = loadBrand(brandPath(f.brands, copy.brand));
    const brandErrors = validateBrand(brand, dir);
    if (brandErrors.length) return res(1, { ok: false, errors: brandErrors }, `brand invalid: ${brandErrors.length} error(s)`);
    const capPath = join(f.project, "caption.txt");
    // the final caption file, when present, is what gets published, so it is what gets linted
    const issues = lintText(existsSync(capPath) ? { ...copy, caption: readFileSync(capPath, "utf8") } : copy, brand);
    writeFileSync(join(f.project, "lint-text.json"), JSON.stringify({ passed: !issues.length, issues, checked_at: new Date().toISOString() }, null, 2));
    return res(issues.length ? 1 : 0, { ok: !issues.length, issues }, `text lint: ${issues.length} issue(s)`);
  },

  render(args) {
    const f = parse(args, { project: "value", brands: "value", chrome: "value" }, ["project", "brands"]);
    if (!existsSync(join(f.project, "copy.json"))) throw new Error(`copy.json not found in ${f.project}`);
    needProject(f.project);
    const status = readMeta(f.project).status;
    if (!["copy_approved", "rendered", "caption_approved"].includes(status)) return res(1, { ok: false, error: `status is "${status}"; render needs copy_approved` }, `render refused: status is "${status}", needs copy_approved`);
    needLint(f.project, "copy.json");
    const { slides } = renderProject({ projectDir: f.project, brandsDir: f.brands, chrome: f.chrome });
    return res(0, { slides }, `rendered ${slides.length} slide(s)`);
  },

  new(args) {
    const f = parse(args, { brand: "value", topic: "value", out: "value", brands: "value" }, ["brand", "topic", "out"]);
    if (f.brands !== undefined && !existsSync(join(f.brands, f.brand, "brand.json"))) throw new Error(`brand not found: ${join(f.brands, f.brand, "brand.json")}`);
    const { dir, meta } = createProject({ outRoot: f.out, brandSlug: f.brand, topic: f.topic });
    return res(0, { dir, code: meta.code }, `created ${meta.code}`);
  },

  knowledge(args) {
    const f = parse(args, { brand: "value", installed: "value" }, ["brand", "installed"]);
    const { brand } = loadBrand(f.brand);
    const installed = f.installed.split(",").map((s) => s.trim()).filter(Boolean);
    return res(0, resolveKnowledge(brand, installed), "knowledge resolved");
  },

  "publish-payload"(args) {
    const f = parse(args, { project: "value", brands: "value", account: "value", at: "value", live: "bool", existing: "value" }, ["project", "brands", "account", "at"]);
    needProject(f.project);
    const meta = readMeta(f.project);
    const verPath = join(f.project, "verification.json");
    const verification = existsSync(verPath) ? readJson(verPath) : null;
    const errors = precheck(meta, verification);
    if (errors.length) return res(1, { ok: false, errors }, `publish refused: ${errors.join("; ")}`);
    const { brand } = loadBrand(brandPath(f.brands, meta.brand));
    const mediaUrls = readJson(join(f.project, "uploads.json"));
    if (!Array.isArray(mediaUrls)) throw new Error("uploads.json must be a JSON array of https URLs");
    const slideDir = join(f.project, "slides");
    const pngs = existsSync(slideDir) ? readdirSync(slideDir).filter((n) => /^slide-\d+\.png$/.test(n)).length : 0;
    if (mediaUrls.length !== pngs) throw new Error(`uploads.json has ${mediaUrls.length} URL(s) but slides/ has ${pngs} slide PNG(s)`);
    const scheduleAt = toUtcIso(f.at, brand.timezone);
    if (f.existing !== undefined) {
      let others;
      try { others = readJson(f.existing); } catch { throw new Error(BAD_EXISTING); }
      if (!Array.isArray(others) || !others.every((o) => o && typeof o.accountId === "string" && typeof o.scheduleAt === "string")) throw new Error(BAD_EXISTING);
      const clash = checkStagger([...others, { accountId: f.account, scheduleAt }]);
      if (clash.length) return res(1, { ok: false, errors: clash }, `publish refused: ${clash.join("; ")}`);
    }
    const payload = buildSchedulePayload({
      accountId: f.account,
      caption: readFileSync(join(f.project, "caption.txt"), "utf8").trim(),
      mediaUrls,
      scheduleAt,
      live: !!f.live,
    });
    return res(0, payload, `payload ready for ${payload.scheduleAt} (${f.live ? "live" : "draft"})`);
  },

  meta(args) {
    const f = parse(args, { project: "value", status: "value", account: "value", "schedule-id": "value", "schedule-at": "value", tracked: "value" }, ["project"]);
    needProject(f.project);
    if (f["schedule-at"] !== undefined && (!ISO_UTC.test(f["schedule-at"]) || Number.isNaN(Date.parse(f["schedule-at"])) || new Date(f["schedule-at"]).toISOString().slice(0, 19) !== f["schedule-at"].slice(0, 19))) throw new Error(`--schedule-at must be ISO 8601 UTC, e.g. 2026-11-03T04:00:00Z: ${f["schedule-at"]}`);
    const patch = {};
    if (f.status === "copy_approved") needLint(f.project, "copy.json");
    if (f.status === "caption_approved") {
      const ver = join(f.project, "verification.json");
      if (!existsSync(ver) || readJson(ver).passed !== true) throw new Error("verification.json missing or not passed; run lint --stage visual first");
      needLint(f.project, "caption.txt");
      if (statSync(ver).mtimeMs < statSync(join(f.project, "copy.json")).mtimeMs) throw new Error("slides are older than copy.json; run render and lint --stage visual again");
    }
    if (f.status !== undefined) patch.status = f.status;
    const repliz = {};
    if (f.account !== undefined) repliz.account = f.account;
    if (f["schedule-id"] !== undefined) repliz.schedule_id = f["schedule-id"];
    if (f["schedule-at"] !== undefined) repliz.schedule_at = f["schedule-at"];
    if (Object.keys(repliz).length) patch.repliz = repliz;
    if (f.tracked !== undefined) {
      if (!["written", "csv", "skipped"].includes(f.tracked)) throw new Error("--tracked must be written, csv or skipped");
      patch.tracking = { state: f.tracked, at: new Date().toISOString() };
    }
    if (!Object.keys(patch).length) throw new Usage("meta needs at least one of --status, --account, --schedule-id, --schedule-at, --tracked");
    const meta = updateMeta(f.project, patch);
    return res(0, meta, `${meta.code}: ${meta.status}`);
  },

  "sheet-row"(args) {
    const f = parse(args, { project: "value", brands: "value" }, ["project", "brands"]);
    needProject(f.project);
    const meta = readMeta(f.project);
    const { brand, dir } = loadBrand(brandPath(f.brands, meta.brand));
    const errors = validateBrand(brand, dir);
    if (errors.length) return res(1, { ok: false, errors }, `brand invalid: ${errors.length} error(s)`);
    const row = buildSheetRow(meta, brand, f.project);
    if (row.tracked) writeFileSync(join(f.project, "sheet-row.csv"), rowToCsv(row));
    return res(0, row, row.tracked ? "sheet row ready" : "brand has no tracking");
  },

  status(args) {
    const f = parse(args, { project: "value" }, ["project"]);
    const verPath = join(f.project, "verification.json");
    needProject(f.project);
    const meta = readMeta(f.project);
    return res(0, { meta, verification: existsSync(verPath) ? readJson(verPath) : null }, `${meta.code}: ${meta.status}`);
  },
};

export function run(argv) {
  const [cmd, ...rest] = argv;
  try {
    if (!COMMANDS.includes(cmd)) throw new Usage(`unknown command: ${cmd ?? "(none)"}; expected one of ${COMMANDS.join(", ")}`);
    return handlers[cmd](rest);
  } catch (e) {
    if (e instanceof Usage) return { code: 2, stdout: "", stderr: `usage error: ${e.message}\n` };
    return { code: 1, stdout: "", stderr: `error: ${e.message}\n` };
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const r = run(process.argv.slice(2));
  process.stdout.write(r.stdout);
  process.stderr.write(r.stderr);
  process.exitCode = r.code;
}
