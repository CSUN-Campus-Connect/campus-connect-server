// src/modules/event/external/StudentRecCenter/studentRecCenter.parser.ts
// Parses raw ICS text from https://news.csun.edu/events/category/usu/src/?ical=1
// into strongly-typed SRCEvent / SRCScheduleClass objects — no npm ICS dependency.

import { SRCEvent, SRCClassCategory, SRCScheduleClass } from "./studentRecCenter.types";

// ── Low-level ICS helpers ────────────────────────────────────────────────────

function unfoldLines(raw: string): string[] {
  // ICS lines longer than 75 chars are folded with CRLF + whitespace.
  return raw
    .replace(/\r\n[ \t]/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/\n[ \t]/g, "")
    .split("\n");
}

function parseIcsDate(value: string, params: string): Date | null {
  if (!value) return null;

  // All-day: VALUE=DATE → YYYYMMDD
  if (params.includes("VALUE=DATE")) {
    const y = +value.slice(0, 4);
    const mo = +value.slice(4, 6) - 1;
    const d = +value.slice(6, 8);
    return new Date(Date.UTC(y, mo, d));
  }

  // UTC: ends with Z → YYYYMMDDTHHmmssZ
  if (value.endsWith("Z")) {
    return new Date(
      `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}` +
        `T${value.slice(9, 11)}:${value.slice(11, 13)}:${value.slice(13, 15)}Z`
    );
  }

  // America/Los_Angeles local time
  // PDT = UTC-7 (Mar–Nov), PST = UTC-8 (Nov–Mar)
  // TODO: replace with luxon DateTime.fromISO(..., { zone: "America/Los_Angeles" })
  const y = +value.slice(0, 4);
  const mo = +value.slice(4, 6) - 1;
  const d = +value.slice(6, 8);
  const h = +value.slice(9, 11);
  const mi = +value.slice(11, 13);
  const s = +value.slice(13, 15);

  // Approximate: determine PDT (UTC-7) vs PST (UTC-8) by month
  const isPDT = mo >= 2 && mo <= 10; // March–November
  const offsetH = isPDT ? 7 : 8;
  return new Date(Date.UTC(y, mo, d, h + offsetH, mi, s));
}

function unescapeIcs(val: string): string {
  return val
    .replace(/\\n/g, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\")
    .trim();
}

// ── Main parser ──────────────────────────────────────────────────────────────

export function parseIcs(raw: string): SRCEvent[] {
  const lines = unfoldLines(raw);
  const events: SRCEvent[] = [];
  let current: (Partial<SRCEvent> & { _raw: Record<string, string> }) | null = null;

  for (const line of lines) {
    if (line === "BEGIN:VEVENT") {
      current = { _raw: {} };
      continue;
    }

    if (line === "END:VEVENT" && current) {
      const r = current._raw;

      const dtStartKey = Object.keys(r).find((k) => k.startsWith("DTSTART")) ?? "";
      const dtEndKey   = Object.keys(r).find((k) => k.startsWith("DTEND"))   ?? "";
      const isAllDay   = dtStartKey.includes("VALUE=DATE");
      const startTime  = dtStartKey ? parseIcsDate(r[dtStartKey], dtStartKey) : null;
      const endTime    = dtEndKey   ? parseIcsDate(r[dtEndKey], dtEndKey)     : null;

      // Parse GEO
      let geo: SRCEvent["geo"] = null;
      if (r["GEO"]) {
        const [lat, lng] = r["GEO"].split(";").map(Number);
        if (!isNaN(lat) && !isNaN(lng)) geo = { lat, lng };
      }

      // Parse ATTACH image URL
      const attachKey = Object.keys(r).find((k) => k.startsWith("ATTACH"));
      const imageUrl  = attachKey ? r[attachKey] ?? null : null;

      // Parse organizer CN
      const orgKey = Object.keys(r).find((k) => k.startsWith("ORGANIZER"));
      let organizer: string | null = null;
      if (orgKey) {
        const cnMatch = orgKey.match(/CN="([^"]+)"/);
        organizer = cnMatch ? cnMatch[1] : null;
      }

      events.push({
        uid:         r["UID"]         ?? "",
        title:       unescapeIcs(r["SUMMARY"]      ?? ""),
        description: unescapeIcs(r["DESCRIPTION"]  ?? ""),
        location:    unescapeIcs(r["LOCATION"]     ?? ""),
        startTime,
        endTime,
        isAllDay,
        url:         r["URL"]         ?? "",
        imageUrl,
        categories:  r["CATEGORIES"]
          ? r["CATEGORIES"].split(",").map((c) => c.trim())
          : [],
        organizer,
        geo,
        createdAt:   r["CREATED"]       ? parseIcsDate(r["CREATED"],       "") ?? new Date() : new Date(),
        updatedAt:   r["LAST-MODIFIED"] ? parseIcsDate(r["LAST-MODIFIED"], "") ?? new Date() : new Date(),
      });

      current = null;
      continue;
    }

    if (!current) continue;

    // Split PROPERTY;PARAMS:VALUE at first colon
    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;
    const keyPart = line.slice(0, colonIdx);
    const val     = line.slice(colonIdx + 1);
    current._raw[keyPart] = val;
  }

  return events;
}

// ── Category inference ───────────────────────────────────────────────────────

const CATEGORY_KEYWORDS: Record<SRCClassCategory, string[]> = {
  Aquatics:              ["swim", "pool", "aquatic", "beginner lessons", "intermediate lessons", "children"],
  "Group Exercise":      ["yoga", "hiit", "zumba", "cardio", "pilates", "barre", "sweatchella", "fitness", "stretch", "abs", "core", "spin", "cycle", "boot camp"],
  Boxing:                ["boxing", "bag", "pads", "gloves"],
  Intramural:            ["intramural", "basketball", "volleyball", "soccer", "softball", "ultimate frisbee", "night hits"],
  "Outdoor Adventures":  ["outdoor", "rock wall", "ridge", "bouldering", "climbing", "hiking", "kayak", "surf"],
  "Special Event":       ["tournament", "event", "guilty gear", "smash", "fifa", "billiards", "games room", "open house"],
  Other:                 [],
};

export function inferCategory(title: string, location: string): SRCClassCategory {
  const haystack = `${title} ${location}`.toLowerCase();
  for (const [cat, keywords] of Object.entries(CATEGORY_KEYWORDS) as [SRCClassCategory, string[]][]) {
    if (cat === "Other") continue;
    if (keywords.some((kw) => haystack.includes(kw))) return cat;
  }
  return "Other";
}

// ── Convert SRCEvent → SRCScheduleClass (timed, non-all-day events only) ────

export function eventsToScheduleClasses(events: SRCEvent[]): SRCScheduleClass[] {
  const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

  return events
    .filter((e) => !e.isAllDay && e.startTime !== null)
    .map((e) => {
      const start = e.startTime!;
      const end   = e.endTime ?? e.startTime!;

      const fmt = (d: Date) =>
        `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;

      return {
        id:              e.uid,
        title:           e.title,
        instructor:      e.organizer,
        location:        e.location.split(",")[0].trim(),
        day:             DAY_NAMES[start.getUTCDay()],
        startTime:       fmt(start),
        endTime:         fmt(end),
        category:        inferCategory(e.title, e.location),
        description:     e.description,
        registrationUrl: e.url,
        imageUrl:        e.imageUrl,
        spots:           null,
      } satisfies SRCScheduleClass;
    });
}

// ── Filter schedule classes by week ─────────────────────────────────────────
// weekStart: ISO date string for the Sunday of the desired week (e.g. "2026-04-27")
// Returns only classes whose event falls within that ISO week.
export function filterClassesByWeek(
  events: SRCEvent[],
  weekStart: string
): SRCScheduleClass[] {
  const start = new Date(weekStart);
  const end   = new Date(start);
  end.setUTCDate(end.getUTCDate() + 7);

  const weekEvents = events.filter((e) => {
    if (!e.startTime) return false;
    return e.startTime >= start && e.startTime < end;
  });

  return eventsToScheduleClasses(weekEvents);
}
