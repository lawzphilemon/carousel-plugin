import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { COMMANDS, FLAGS, run } from "../engine/cli.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (p) => readFileSync(join(root, p), "utf8");
const cmdFiles = readdirSync(join(root, "commands")).filter((f) => f.endsWith(".md"));
const walk = (d) => readdirSync(d).flatMap((n) => (statSync(join(d, n)).isDirectory() ? walk(join(d, n)) : [join(d, n)]));
const frontMatter = (s) => /^---\n([\s\S]*?)\n---/.exec(s.replace(/\r\n/g, "\n"))?.[1] ?? "";

test("commands have front matter name and description", () => {
  assert.deepEqual(cmdFiles.sort(), ["brand.md", "make.md", "publish.md"]);
  for (const f of cmdFiles) {
    const fm = frontMatter(read(`commands/${f}`));
    assert.match(fm, /^name: \S+/m, f);
    assert.match(fm, /^description: .+/m, f);
  }
});

test("every engine invocation names a real command and real flags", () => {
  let seen = 0;
  for (const f of cmdFiles) {
    for (const line of read(`commands/${f}`).split(/\r?\n/)) {
      const m = /engine\/cli\.mjs"?\s+([a-z-]+)(.*)$/.exec(line);
      if (!m) continue;
      seen++;
      assert.ok(COMMANDS.includes(m[1]), `${f}: unknown command ${m[1]}`);
      for (const [, flag] of m[2].matchAll(/--([a-z-]+)/g)) assert.ok(FLAGS[m[1]].includes(flag), `${f}: --${flag} not valid for ${m[1]}`);
    }
  }
  assert.ok(seen >= 8, `only ${seen} invocations found`);
});

test("every FLAGS entry is accepted by the parser", () => {
  assert.deepEqual(Object.keys(FLAGS).sort(), [...COMMANDS].sort());
  for (const [cmd, flags] of Object.entries(FLAGS))
    for (const flag of flags) assert.ok(!run([cmd, `--${flag}`]).stderr.includes(`unknown argument: --${flag}`), `${cmd} --${flag}`);
});

test("craft skill exists with front matter", () => {
  const fm = frontMatter(read("skills/carousel-craft/SKILL.md"));
  assert.match(fm, /^name: carousel-craft/m);
  assert.match(fm, /^description: .+/m);
  for (const r of ["hooks", "anatomy", "captions"]) assert.ok(existsSync(join(root, `skills/carousel-craft/references/${r}.md`)), r);
});

test("optional-skill mentions", () => {
  const files = [...walk(join(root, "commands")), ...walk(join(root, "skills"))].map((p) => p.slice(root.length).replaceAll("\\", "/"));
  const allowed = ["commands/make.md", "skills/carousel-craft/SKILL.md"];
  for (const p of files) {
    const s = readFileSync(join(root, p), "utf8");
    for (const line of s.split(/\r?\n/).filter((l) => /wtf-hook|creator-os/.test(l))) {
      assert.ok(allowed.some((a) => p.endsWith(a)), `${p} mentions a third-party skill`);
      assert.match(line, /optional/i, p);
      assert.match(line, /not bundled/i, p);
    }
  }
});

test("commands and skills avoid blocklisted names", (t) => {
  const f = process.env.CAROUSEL_BLOCKLIST_FILE;
  if (!f) return t.skip("CAROUSEL_BLOCKLIST_FILE not set: blocklist check skipped");
  const names = readFileSync(f, "utf8").split(/\r?\n/).map((n) => n.trim().toLowerCase()).filter(Boolean);
  for (const p of [...walk(join(root, "commands")), ...walk(join(root, "skills"))]) {
    const s = readFileSync(p, "utf8").toLowerCase();
    for (const n of names) assert.ok(!s.includes(n), `${p} contains a blocklisted name`);
  }
});
