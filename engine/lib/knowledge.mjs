const ROLES = ["hook", "script", "humanizer"];

export function resolveKnowledge(brand, installed = []) {
  installed = installed ?? [];
  const out = { notes: [] };
  for (const role of ROLES) {
    const list = brand?.knowledge?.[role];
    if (list != null && !Array.isArray(list)) out.notes.push(`knowledge.${role} must be an array; ignored`);
    const configured = Array.isArray(list) ? [...new Set(list)] : [];
    const use = configured.filter((s) => installed.includes(s));
    for (const s of configured) if (!use.includes(s)) out.notes.push(`${s} is not installed; using bundled guide`);
    out[role] = { use, fallback: use.length === 0 };
  }
  return out;
}
