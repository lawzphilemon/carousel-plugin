const LOCAL_RE = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})$/;

// Local wall-clock of utcMs in zone, read back as if it were UTC.
function wallAsUtc(utcMs, timeZone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  }).formatToParts(new Date(utcMs));
  const p = Object.fromEntries(parts.map((x) => [x.type, +x.value]));
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
}

export function toUtcIso(localDateTime, timeZone) {
  if (typeof timeZone !== "string" || !timeZone) throw new Error("timeZone is required");
  const m = LOCAL_RE.exec(localDateTime);
  if (!m) throw new Error(`Bad date-time "${localDateTime}"; expected YYYY-MM-DD HH:mm`);
  const [y, mo, d, h, mi] = m.slice(1).map(Number);
  const wall = Date.UTC(y, mo - 1, d, h, mi);
  const back = new Date(wall);
  if (back.getUTCFullYear() !== y || back.getUTCMonth() !== mo - 1 || back.getUTCDate() !== d || h > 23 || mi > 59) {
    throw new Error(`Invalid date-time "${localDateTime}"`);
  }
  wallAsUtc(wall, timeZone); // throws RangeError on unknown zone
  let t = wall - (wallAsUtc(wall, timeZone) - wall);
  t = wall - (wallAsUtc(t, timeZone) - t);
  if (wallAsUtc(t, timeZone) !== wall) throw new Error(`"${localDateTime}" does not exist in ${timeZone} (DST gap)`);
  return new Date(t).toISOString();
}

export function checkStagger(items) {
  const errors = [];
  const minute = (s) => Math.floor(Date.parse(s) / 60000);
  items.forEach((it, i) => { if (Number.isNaN(Date.parse(it.scheduleAt))) errors.push(`Item ${i} has an unparseable scheduleAt: ${it.scheduleAt}`); });
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      if (items[i].accountId === items[j].accountId && minute(items[i].scheduleAt) === minute(items[j].scheduleAt)) {
        errors.push(`Items ${i} and ${j} share account ${items[i].accountId} within the same minute`);
      }
    }
  }
  return errors;
}

export function precheck(meta, verification) {
  const errors = [];
  if (meta?.status !== "caption_approved") errors.push(`Status is "${meta?.status}"; must be caption_approved`);
  if (verification?.passed !== true) errors.push("verification did not pass");
  return errors;
}

export function buildSchedulePayload({ accountId, caption, mediaUrls, scheduleAt, live = false }) {
  if (!accountId) throw new Error("accountId is required");
  if (typeof caption !== "string" || !caption.trim()) throw new Error("caption must be a non-empty string");
  if (typeof scheduleAt !== "string" || Number.isNaN(Date.parse(scheduleAt))) throw new Error("scheduleAt must be an ISO date-time string");
  if (!Array.isArray(mediaUrls) || mediaUrls.length === 0) throw new Error("mediaUrls is empty");
  const bad = mediaUrls.find((u) => typeof u !== "string" || !u.startsWith("https://"));
  if (bad !== undefined) throw new Error(`Media URL must be https://: ${bad}`);
  return {
    accountId, type: "album", description: caption, scheduleAt,
    medias: mediaUrls.map((url) => ({ type: "image", url })),
    additionalInfo: { isDraft: !live },
  };
}
