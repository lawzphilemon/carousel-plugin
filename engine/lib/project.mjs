import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

export const STATUSES = ["draft", "copy_approved", "rendered", "caption_approved", "scheduled"];

export function newCode(date = new Date(), rand = () => crypto.randomBytes(2).toString("hex").toUpperCase()) {
  const ymd = date.toISOString().slice(2, 10).replaceAll("-", "");
  return `CAR-${ymd}-${rand()}`;
}

export function slugify(s) {
  const slug = String(s)
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .slice(0, 40)
    .replace(/^-+|-+$/g, "");
  return slug || "carousel";
}

export function createProject({ outRoot, brandSlug, topic, slug, date = new Date(), rand }) {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(brandSlug)) throw new Error(`invalid brandSlug: ${JSON.stringify(brandSlug)}`);
  const code = newCode(date, rand);
  const dir = path.join(outRoot, brandSlug, `${code}_${slugify(slug ?? topic)}`);
  if (!path.resolve(dir).startsWith(path.resolve(outRoot) + path.sep)) throw new Error(`project dir escapes outRoot: ${dir}`);
  if (fs.existsSync(dir)) throw new Error(`project directory already exists: ${dir}`);
  fs.mkdirSync(path.join(dir, "slides"), { recursive: true });
  const meta = {
    code,
    kind: "Carousel",
    brand: brandSlug,
    topic,
    status: "draft",
    created: date.toISOString().slice(0, 10),
    repliz: { account: null, schedule_id: null, schedule_at: null },
  };
  fs.writeFileSync(path.join(dir, "meta.json"), JSON.stringify(meta, null, 2) + "\n");
  return { dir, meta };
}

export function readMeta(dir) {
  return JSON.parse(fs.readFileSync(path.join(dir, "meta.json"), "utf8"));
}

// allowStatusReset: only render uses it, because new slides void any later approval
export function updateMeta(dir, patch, { allowStatusReset = false } = {}) {
  const meta = readMeta(dir);
  if ("status" in patch) {
    const to = STATUSES.indexOf(patch.status);
    if (to < 0) throw new Error(`unknown status: ${patch.status}`);
    if (!allowStatusReset && to < STATUSES.indexOf(meta.status)) throw new Error(`status cannot move backwards: ${meta.status} -> ${patch.status}`);
  }
  const next = { ...meta, ...patch, repliz: { ...meta.repliz, ...patch.repliz } };
  const tmp = path.join(dir, `meta.json.${process.pid}.tmp`);
  fs.writeFileSync(tmp, JSON.stringify(next, null, 2) + "\n");
  fs.renameSync(tmp, path.join(dir, "meta.json"));
  return next;
}
