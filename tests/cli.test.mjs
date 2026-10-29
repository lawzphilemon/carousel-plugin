import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { COMMANDS, run } from "../engine/cli.mjs";
import { findChrome } from "../engine/lib/chrome.mjs";
import { updateMeta } from "../engine/lib/project.mjs";

let chrome = null;
try { chrome = findChrome(); } catch { /* skipped below */ }

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "car-cli-"));
const out = (r) => JSON.parse(r.stdout);
const mk = (status = "draft", mutate) => {
  const root = tmp();
  const r = run(["new", "--brand", "acme", "--topic", "t", "--out", root]);
  const dir = out(r).dir;
  const copy = JSON.parse(fs.readFileSync("tests/fixtures/copy-ok.json", "utf8"));
  if (mutate) mutate(copy);
  fs.writeFileSync(path.join(dir, "copy.json"), JSON.stringify(copy));
  if (status !== "draft") updateMeta(dir, { status });
  return dir;
};

const lint = (dir) => run(["lint", "--stage", "text", "--project", dir, "--brands", "examples"]);

test("COMMANDS", () => {
  assert.deepEqual(COMMANDS, ["lint", "render", "new", "knowledge", "publish-payload", "status", "meta"]);
});

test("unknown command and missing flag exit 2", () => {
  assert.equal(run(["nope"]).code, 2);
  assert.equal(run([]).code, 2);
  assert.equal(run(["new", "--brand", "acme"]).code, 2);
  assert.equal(run(["knowledge", "--bogus", "1"]).code, 2);
  const s = spawnSync(process.execPath, ["engine/cli.mjs", "nope"], { encoding: "utf8" });
  assert.equal(s.status, 2);
});

test("lint --self-check", () => {
  const ok = run(["lint", "--self-check", "--brand", "examples/acme/brand.json"]);
  assert.equal(ok.code, 0);
  assert.equal(out(ok).ok, true);
  const bad = run(["lint", "--self-check", "--brand", "tests/fixtures/broken-brand/brand.json"]);
  assert.equal(bad.code, 1);
  assert.match(bad.stdout, /font/i);
  const s = spawnSync(process.execPath, ["engine/cli.mjs", "lint", "--self-check", "--brand", "tests/fixtures/broken-brand/brand.json"], { encoding: "utf8" });
  assert.equal(s.status, 1);
});

test("lint --stage text writes lint-text.json", () => {
  const dir = mk();
  const r = run(["lint", "--stage", "text", "--project", dir, "--brands", "examples"]);
  assert.equal(r.code, 0, r.stdout);
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, "lint-text.json"), "utf8")).passed, true);
  const bad = mk("draft", (c) => { c.slides[1].body = "Get a discount today."; });
  const b = run(["lint", "--stage", "text", "--project", bad, "--brands", "examples"]);
  assert.equal(b.code, 1);
  assert.ok(out(b).issues.some((i) => i.rule === "forbidden-word"));
  assert.equal(JSON.parse(fs.readFileSync(path.join(bad, "lint-text.json"), "utf8")).passed, false);
});

test("new", () => {
  const root = tmp();
  const r = run(["new", "--brand", "acme", "--topic", "Hello", "--out", root, "--brands", "examples"]);
  assert.equal(r.code, 0);
  const { dir, code } = out(r);
  assert.match(code, /^CAR-\d{6}-[0-9A-F]{4}$/);
  assert.ok(fs.existsSync(path.join(dir, "meta.json")));
  assert.equal(run(["new", "--brand", "ghost", "--topic", "x", "--out", root, "--brands", "examples"]).code, 1);
});

test("knowledge", () => {
  const r = run(["knowledge", "--brand", "examples/acme/brand.json", "--installed", ""]);
  assert.equal(r.code, 0);
  assert.equal(out(r).hook.fallback, true);
});

test("status", () => {
  const dir = mk();
  const r = out(run(["status", "--project", dir]));
  assert.equal(r.meta.status, "draft");
  assert.equal(r.verification, null);
  fs.writeFileSync(path.join(dir, "verification.json"), JSON.stringify({ passed: true, issues: [] }));
  assert.equal(out(run(["status", "--project", dir])).verification.passed, true);
});

test("publish-payload", () => {
  const args = (dir) => ["publish-payload", "--project", dir, "--brands", "examples", "--account", "acc1", "--at", "2026-11-01 09:00"];
  const prep = (status) => {
    const dir = mk(status);
    fs.writeFileSync(path.join(dir, "uploads.json"), JSON.stringify(["https://x.test/1.png", "https://x.test/2.png"]));
    fs.writeFileSync(path.join(dir, "caption.txt"), "A caption");
    fs.writeFileSync(path.join(dir, "verification.json"), JSON.stringify({ passed: true, issues: [] }));
    for (const n of ["01", "02"]) fs.writeFileSync(path.join(dir, "slides", `slide-${n}.png`), "x");
    return dir;
  };
  const ok = run(args(prep("caption_approved")));
  assert.equal(ok.code, 0, ok.stderr);
  const p = out(ok);
  assert.equal(p.type, "album");
  assert.equal(p.medias.length, 2);
  assert.match(p.scheduleAt, /Z$/);
  assert.equal(p.additionalInfo.isDraft, true);
  assert.equal(out(run([...args(prep("caption_approved")), "--live"])).additionalInfo.isDraft, false);
  const bad = run(args(prep("rendered")));
  assert.equal(bad.code, 1);
  assert.match(bad.stderr + bad.stdout, /caption_approved/);
});

test("render refuses unless copy_approved", () => {
  const r = run(["render", "--project", mk("draft"), "--brands", "examples"]);
  assert.equal(r.code, 1);
  assert.match(r.stderr, /copy_approved/);
});

test("end to end: render then visual lint", { skip: chrome ? false : "Chrome not found" }, () => {
  const dir = mk("copy_approved");
  assert.equal(lint(dir).code, 0);
  const base = ["--project", dir, "--brands", "examples"];
  const r = run(["render", ...base]);
  assert.equal(r.code, 0, r.stderr);
  assert.ok(out(r).slides.length > 0);
  const v = run(["lint", "--stage", "visual", ...base]);
  assert.equal(v.code, 0, v.stdout);
  assert.equal(out(run(["status", "--project", dir])).verification.passed, true);
});

test("meta command", () => {
  const dir = mk();
  const m = (...a) => run(["meta", "--project", dir, ...a]);
  assert.equal(lint(dir).code, 0);
  assert.equal(m("--status", "copy_approved").code, 0);
  assert.equal(out(m("--status", "copy_approved")).status, "copy_approved");
  assert.equal(m("--status", "draft").code, 1);
  assert.equal(m("--status", "bogus").code, 1);
  const r = m("--status", "scheduled", "--account", "a1", "--schedule-id", "s1", "--schedule-at", "2026-11-03T00:30:00.000Z");
  assert.equal(r.code, 0);
  const meta = out(r);
  assert.deepEqual(meta.repliz, { account: "a1", schedule_id: "s1", schedule_at: "2026-11-03T00:30:00.000Z" });
  assert.equal(m("--schedule-id", "s2").code, 0);
  assert.equal(out(m("--account", "a1")).repliz.schedule_id, "s2");
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, "meta.json"), "utf8")).brand, "acme");
  assert.equal(m().code, 2);
  assert.equal(run(["meta", "--status", "scheduled"]).code, 2);
});

test("meta rejects a bad --schedule-at", () => {
  const dir = mk();
  for (const v of ["tomorrow", "2026-11-03 11:00", "2026-11-03T00:30:00+07:00"]) {
    const r = run(["meta", "--project", dir, "--schedule-at", v]);
    assert.equal(r.code, 1, v);
    assert.equal(r.stderr.trim().split("\n").length, 1);
  }
  assert.equal(run(["meta", "--project", dir, "--schedule-at", "2026-11-03T00:30:00Z"]).code, 0);
});
test("missing project dir gives project not found", () => {
  const dir = path.join(tmp(), "nope");
  fs.mkdirSync(dir);
  fs.writeFileSync(path.join(dir, "copy.json"), "{}");
  for (const a of [["meta", "--status", "copy_approved"], ["status"], ["render", "--brands", "examples"]]) {
    const r = run([a[0], "--project", dir, ...a.slice(1)]);
    assert.equal(r.code, 1, a[0]);
    assert.match(r.stderr, /project not found: /);
  }
});
test("lint text rejects a non-object copy.json", () => {
  for (const body of ["null", "[]", "5"]) {
    const dir = mk();
    fs.writeFileSync(path.join(dir, "copy.json"), body);
    const r = run(["lint", "--stage", "text", "--project", dir, "--brands", "examples"]);
    assert.equal(r.code, 1, body);
    assert.match(r.stderr, /copy\.json must be an object/);
  }
});

const chromeTest = { skip: chrome ? false : "Chrome not found" };
const readMetaJson = (dir) => JSON.parse(fs.readFileSync(path.join(dir, "meta.json"), "utf8"));
const touchLater = (p) => { const t = new Date(Date.now() + 5000); fs.utimesSync(p, t, t); };

test("render twice works, resets from caption_approved, drops stale verification", chromeTest, () => {
  const dir = mk("copy_approved");
  assert.equal(lint(dir).code, 0);
  const base = ["--project", dir, "--brands", "examples"];
  assert.equal(run(["render", ...base]).code, 0);
  assert.equal(readMetaJson(dir).status, "rendered");
  fs.writeFileSync(path.join(dir, "verification.json"), JSON.stringify({ passed: true, issues: [] }));
  const second = run(["render", ...base]);
  assert.equal(second.code, 0, second.stderr);
  assert.equal(fs.existsSync(path.join(dir, "verification.json")), false);
  updateMeta(dir, { status: "caption_approved" });
  assert.equal(run(["render", ...base]).code, 0);
  assert.equal(readMetaJson(dir).status, "rendered");
  assert.equal(run(["meta", "--project", dir, "--status", "copy_approved"]).code, 1);
});

test("render refuses without a fresh passing lint-text.json", () => {
  const dir = mk("copy_approved");
  const base = ["render", "--project", dir, "--brands", "examples"];
  const msg = /run lint --stage text first \(lint-text\.json missing, failed or older than copy\.json\)/;
  assert.match(run(base).stderr, msg);
  fs.writeFileSync(path.join(dir, "lint-text.json"), JSON.stringify({ passed: false, issues: [] }));
  assert.match(run(base).stderr, msg);
  assert.equal(lint(dir).code, 0);
  touchLater(path.join(dir, "copy.json"));
  assert.match(run(base).stderr, msg);
});

test("meta gates: copy_approved needs fresh passing lint", () => {
  const dir = mk();
  const m = () => run(["meta", "--project", dir, "--status", "copy_approved"]);
  assert.equal(m().code, 1);
  assert.match(m().stderr, /lint/);
  assert.equal(lint(dir).code, 0);
  assert.equal(m().code, 0);
  const noCopy = mk();
  fs.rmSync(path.join(noCopy, "copy.json"));
  assert.equal(run(["meta", "--project", noCopy, "--status", "copy_approved"]).code, 1);
});

test("meta gates: caption_approved needs verification, caption.txt and fresh lint", () => {
  const dir = mk("rendered");
  const m = () => run(["meta", "--project", dir, "--status", "caption_approved"]);
  assert.equal(m().code, 1);
  fs.writeFileSync(path.join(dir, "verification.json"), JSON.stringify({ passed: true, issues: [] }));
  assert.equal(m().code, 1);
  fs.writeFileSync(path.join(dir, "caption.txt"), "A caption");
  assert.equal(m().code, 1);
  assert.equal(lint(dir).code, 0);
  touchLater(path.join(dir, "caption.txt"));
  assert.equal(m().code, 1);
  assert.equal(lint(dir).code, 0);
  fs.utimesSync(path.join(dir, "lint-text.json"), new Date(Date.now() + 10000), new Date(Date.now() + 10000));
  assert.equal(m().code, 0, m().stderr);
  const failed = mk("rendered");
  fs.writeFileSync(path.join(failed, "verification.json"), JSON.stringify({ passed: false, issues: [] }));
  fs.writeFileSync(path.join(failed, "caption.txt"), "A caption");
  assert.equal(lint(failed).code, 0);
  assert.equal(run(["meta", "--project", failed, "--status", "caption_approved"]).code, 1);
});

test("lint text exits 1 on an invalid brand", () => {
  const dir = mk();
  const root = tmp();
  fs.cpSync("tests/fixtures/broken-brand", path.join(root, "acme"), { recursive: true });
  const r = run(["lint", "--stage", "text", "--project", dir, "--brands", root]);
  assert.equal(r.code, 1);
  assert.match(r.stdout, /font/i);
  assert.equal(fs.existsSync(path.join(dir, "lint-text.json")), false);
});

test("lint text checks caption.txt in place of copy.caption", () => {
  const dir = mk();
  assert.equal(lint(dir).code, 0);
  const cases = [["Sales up 80%.", "claim-source"], ["Wow!", "exclamation"], ["Get a discount", "forbidden-word"], ["Only Rp 2 juta", "price"], ["Nice 🙂🙂", "emoji"]];
  for (const [text, rule] of cases) {
    fs.writeFileSync(path.join(dir, "caption.txt"), text);
    const r = lint(dir);
    assert.equal(r.code, 1, text);
    assert.ok(out(r).issues.some((i) => i.rule === rule), `${text} -> ${rule}`);
  }
  fs.writeFileSync(path.join(dir, "caption.txt"), "A clean caption.");
  assert.equal(lint(dir).code, 0);
  // copy.caption is ignored once caption.txt exists
  const d2 = mk("draft", (c) => { c.caption = "Wow!"; });
  fs.writeFileSync(path.join(d2, "caption.txt"), "A clean caption.");
  assert.equal(lint(d2).code, 0);
});

test("publish-payload checks upload count, shape, project and stagger", () => {
  const prep = (urls) => {
    const dir = mk("caption_approved");
    fs.writeFileSync(path.join(dir, "uploads.json"), JSON.stringify(urls));
    fs.writeFileSync(path.join(dir, "caption.txt"), "A caption");
    fs.writeFileSync(path.join(dir, "verification.json"), JSON.stringify({ passed: true, issues: [] }));
    for (const n of ["01", "02", "03"]) fs.writeFileSync(path.join(dir, "slides", `slide-${n}.png`), "x");
    return dir;
  };
  const args = (dir, ...more) => ["publish-payload", "--project", dir, "--brands", "examples", "--account", "acc1", "--at", "2026-11-01 09:00", ...more];
  const urls = ["https://x.test/1.png", "https://x.test/2.png", "https://x.test/3.png"];
  assert.equal(run(args(prep(urls))).code, 0);
  const few = run(args(prep(urls.slice(0, 2))));
  assert.equal(few.code, 1);
  assert.match(few.stderr, /2/);
  assert.match(few.stderr, /3/);
  for (const bad of [{ a: 1 }, "https://x.test/1.png"]) {
    const r = run(args(prep(bad)));
    assert.equal(r.code, 1);
    assert.match(r.stderr, /uploads\.json must be a JSON array of https URLs/);
  }
  const gone = run(["publish-payload", "--project", path.join(tmp(), "nope"), "--brands", "examples", "--account", "a", "--at", "2026-11-01 09:00"]);
  assert.equal(gone.code, 1);
  assert.match(gone.stderr, /project not found: /);

  const dir = prep(urls);
  const existing = path.join(tmp(), "existing.json");
  fs.writeFileSync(existing, JSON.stringify([{ accountId: "acc1", scheduleAt: "2026-11-01T02:00:20.000Z" }]));
  const clash = run(args(dir, "--existing", existing));
  assert.equal(clash.code, 1);
  assert.match(clash.stderr, /acc1/);
  fs.writeFileSync(existing, JSON.stringify([{ accountId: "acc2", scheduleAt: "2026-11-01T02:00:00.000Z" }, { accountId: "acc1", scheduleAt: "2026-11-01T03:00:00.000Z" }]));
  assert.equal(run(args(dir, "--existing", existing)).code, 0);
});

test("brand slug from project files is validated before use", () => {
  const dir = mk("caption_approved", (c) => { c.brand = "../acme"; });
  const l = lint(dir);
  assert.equal(l.code, 1);
  assert.match(l.stderr, /invalid brand slug/);
  assert.match(run(["lint", "--stage", "visual", "--project", dir, "--brands", "examples"]).stderr, /invalid brand slug/);
  const m = JSON.parse(fs.readFileSync(path.join(dir, "meta.json"), "utf8"));
  m.brand = "../acme";
  fs.writeFileSync(path.join(dir, "meta.json"), JSON.stringify(m));
  fs.writeFileSync(path.join(dir, "uploads.json"), "[]");
  fs.writeFileSync(path.join(dir, "caption.txt"), "A caption");
  fs.writeFileSync(path.join(dir, "verification.json"), JSON.stringify({ passed: true, issues: [] }));
  const p = run(["publish-payload", "--project", dir, "--brands", "examples", "--account", "a", "--at", "2026-11-01 09:00"]);
  assert.equal(p.code, 1);
  assert.match(p.stderr, /invalid brand slug/);
});

test("caption_approved is refused when slides are older than copy.json", () => {
  const dir = mk("rendered");
  fs.writeFileSync(path.join(dir, "caption.txt"), "A caption");
  fs.writeFileSync(path.join(dir, "verification.json"), JSON.stringify({ passed: true, issues: [] }));
  assert.equal(lint(dir).code, 0);
  touchLater(path.join(dir, "copy.json"));
  assert.equal(lint(dir).code, 0);
  fs.utimesSync(path.join(dir, "lint-text.json"), new Date(Date.now() + 20000), new Date(Date.now() + 20000));
  const r = run(["meta", "--project", dir, "--status", "caption_approved"]);
  assert.equal(r.code, 1);
  assert.match(r.stderr, /slides are older than copy\.json; run render and lint --stage visual again/);
  fs.utimesSync(path.join(dir, "verification.json"), new Date(Date.now() + 30000), new Date(Date.now() + 30000));
  assert.equal(run(["meta", "--project", dir, "--status", "caption_approved"]).code, 0);
});

test("publish-payload --existing gives one precise message for bad input", () => {
  const dir = mk("caption_approved");
  fs.writeFileSync(path.join(dir, "uploads.json"), "[]");
  fs.writeFileSync(path.join(dir, "caption.txt"), "A caption");
  fs.writeFileSync(path.join(dir, "verification.json"), JSON.stringify({ passed: true, issues: [] }));
  const f = path.join(tmp(), "e.json");
  for (const body of ["{not json", "{}", "[1]", '[{"accountId":"a"}]', "[null]"]) {
    fs.writeFileSync(f, body);
    const r = run(["publish-payload", "--project", dir, "--brands", "examples", "--account", "a", "--at", "2026-11-01 09:00", "--existing", f]);
    assert.equal(r.code, 1, body);
    assert.equal(r.stderr.trim(), "error: --existing must be a JSON array of {accountId, scheduleAt}", body);
  }
});

test("meta rejects calendar-invalid --schedule-at", () => {
  const dir = mk();
  for (const v of ["2026-02-31T03:00:00Z", "2026-13-01T03:00:00Z", "2026-04-31T03:00:00.000Z"]) {
    assert.equal(run(["meta", "--project", dir, "--schedule-at", v]).code, 1, v);
  }
  assert.equal(run(["meta", "--project", dir, "--schedule-at", "2026-02-28T03:00:00Z"]).code, 0);
});
