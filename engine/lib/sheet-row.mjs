import path from "node:path";

const ORDER = ["code", "topic", "status", "scheduled_at", "account", "repliz_id", "folder"];

export function buildSheetRow(meta, brand, projectDir) {
  const t = brand?.tracking;
  if (!t) return { tracked: false };
  if (meta.status !== "scheduled") throw new Error(`project status must be scheduled, got ${meta.status}`);
  if (!meta.repliz?.schedule_id) throw new Error("meta.repliz.schedule_id is missing");
  const src = {
    code: meta.code,
    topic: meta.topic,
    status: t.status_values.scheduled,
    scheduled_at: meta.repliz.schedule_at,
    account: meta.repliz.account,
    repliz_id: meta.repliz.schedule_id,
    folder: `${meta.brand}/${path.basename(projectDir)}`,
  };
  const keys = ORDER.filter((k) => t.columns[k]);
  const cells = {};
  for (const k of keys) cells[t.columns[k]] = src[k] == null ? "" : String(src[k]);
  const by = t.match_by ?? "code";
  return {
    tracked: true,
    expected_headers: keys.map((k) => t.columns[k]),
    cells,
    match: { column: t.match_column, by, value: by === "topic" ? String(meta.topic).trim() : meta.code },
  };
}

const q = (s) => (/[,"\r\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s);

export function rowToCsv(row) {
  if (!row.tracked) throw new Error("nothing to export: row is not tracked");
  const h = row.expected_headers;
  return `${h.map(q).join(",")}\r\n${h.map((x) => q(row.cells[x])).join(",")}\r\n`;
}
