const ORDER = ["code", "topic", "status", "scheduled_at", "account", "repliz_id", "folder"];

export function buildSheetRow(meta, brand, projectDir) {
  const t = brand?.tracking;
  if (!t) return { tracked: false };
  if (meta.status !== "scheduled") throw new Error(`project status must be scheduled, got ${meta.status}`);
  if (!meta.repliz?.schedule_id) throw new Error("meta.repliz.schedule_id is missing");
  if (!meta.brand) throw new Error("meta.brand is missing");
  if (!t.columns || typeof t.columns !== "object") throw new Error("tracking.columns is missing");
  const src = {
    code: meta.code,
    topic: meta.topic,
    status: t.status_values.scheduled,
    scheduled_at: meta.repliz.schedule_at,
    account: meta.repliz.account,
    repliz_id: meta.repliz.schedule_id,
    folder: `${meta.brand}/${String(projectDir).replaceAll("\\", "/").split("/").filter(Boolean).pop()}`,
  };
  const keys = ORDER.filter((k) => t.columns[k]);
  const cells = {};
  for (const k of keys) cells[t.columns[k]] = src[k] == null ? "" : String(src[k]);
  const by = t.match_by ?? "code";
  const topic = String(meta.topic ?? "").trim();
  if (by === "topic" && !topic) throw new Error("topic is empty: cannot match a sheet row by topic");
  return {
    tracked: true,
    sheet_id: t.sheet_id,
    tab: t.tab,
    mode: t.mode,
    expected_headers: keys.map((k) => t.columns[k]),
    cells,
    match: { column: t.match_column, by, value: by === "topic" ? topic : meta.code },
  };
}

const q = (s) => (/[,"\r\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s);

export function rowToCsv(row) {
  if (!row.tracked) throw new Error("nothing to export: row is not tracked");
  const h = row.expected_headers;
  return `${h.map(q).join(",")}\r\n${h.map((x) => q(row.cells[x])).join(",")}\r\n`;
}
