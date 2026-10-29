import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { STATUSES, newCode, slugify, createProject, readMeta, updateMeta } from "../engine/lib/project.mjs";

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "car-proj-"));
const mk = (root, extra = {}) =>
  createProject({ outRoot: root, brandSlug: "acme", topic: "Ads: 3 Angka Penting!", date: new Date("2026-10-30T00:00:00Z"), ...extra });

test("newCode", () => {
  assert.equal(newCode(new Date("2026-10-30T00:00:00Z"), () => "A1B2"), "CAR-261030-A1B2");
  assert.match(newCode(), /^CAR-\d{6}-[0-9A-F]{4}$/);
});

test("slugify", () => {
  assert.equal(slugify("Ads: 3 Angka Penting!"), "ads-3-angka-penting");
  assert.ok(slugify("a".repeat(100)).length <= 40);
  assert.equal(slugify("!!! ???"), "carousel");
});

test("createProject + updateMeta", () => {
  const root = tmp();
  try {
    const { dir, meta } = mk(root);
    assert.ok(dir.startsWith(path.join(root, "acme", "CAR-261030-")));
    assert.ok(dir.endsWith("_ads-3-angka-penting"));
    assert.ok(fs.statSync(path.join(dir, "slides")).isDirectory());
    const disk = JSON.parse(fs.readFileSync(path.join(dir, "meta.json"), "utf8"));
    assert.deepEqual(disk, meta);
    assert.equal(disk.status, "draft");
    assert.equal(disk.kind, "Carousel");
    assert.equal(disk.brand, "acme");
    assert.equal(disk.created, "2026-10-30");
    assert.deepEqual(disk.repliz, { account: null, schedule_id: null, schedule_at: null });
    assert.equal(updateMeta(dir, { status: "rendered" }).status, "rendered");
    assert.throws(() => updateMeta(dir, { status: "draft" }));
    assert.throws(() => updateMeta(dir, { status: "nope" }));
    assert.equal(readMeta(dir).status, "rendered");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("updateMeta merges repliz one level", () => {
  const root = tmp();
  try {
    const { dir } = mk(root);
    updateMeta(dir, { repliz: { account: "acc1" } });
    const m = updateMeta(dir, { repliz: { schedule_id: "s1" } });
    assert.deepEqual(m.repliz, { account: "acc1", schedule_id: "s1", schedule_at: null });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("createProject throws on collision", () => {
  const root = tmp();
  try {
    fs.mkdirSync(path.join(root, "acme", "CAR-261030-ZZZZ_x"), { recursive: true });
    assert.throws(() => mk(root, { slug: "x", rand: () => "ZZZZ" }), /exists/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("createProject rejects unsafe brandSlug", () => {
  const root = tmp();
  try {
    for (const bad of ["../../evil", "a/b", ""]) {
      assert.throws(() => mk(root, { brandSlug: bad }), /invalid brandSlug/);
    }
    assert.deepEqual(fs.readdirSync(root), []);
    assert.ok(mk(root, { brandSlug: "acme" }).dir.startsWith(path.resolve(root)));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("updateMeta writes atomically and leaves no temp files", () => {
  const root = tmp();
  try {
    const { dir } = mk(root);
    const before = fs.readFileSync(path.join(dir, "meta.json"));
    assert.throws(() => updateMeta(dir, { status: "bogus" }));
    assert.deepEqual(fs.readFileSync(path.join(dir, "meta.json")), before);
    updateMeta(dir, { status: "copy_approved" });
    assert.deepEqual(fs.readdirSync(dir).sort(), ["meta.json", "slides"]);
    assert.equal(readMeta(dir).status, "copy_approved");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
