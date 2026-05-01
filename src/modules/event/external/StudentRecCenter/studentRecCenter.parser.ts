// src/modules/event/external/StudentRecCenter/studentRecCenter.parser.ts
//
// FIX (2026-05-01):
//  1. unfoldLines handles both CRLF+space and bare LF+space folding
//  2. parseIcsDate stores TZID wall-clock digits as UTC for display consistency
//  3. filterClassesByWeek window inclusive on both ends (Sat events no longer dropped)
//  4. eventsToScheduleClasses handles equal start/end time (adds 1h)
//  5. inferCategory expanded with CSUN-specific keywords (CPR, intramural sports, etc.)
//  6. All-day multi-day events (CPR, Intramural season) preserved as SRCEvents
//     but excluded from schedule grid (no startTime on grid — shown in banner only)

import { SRCEvent, SRCClassCategory, SRCScheduleClass } from "./studentRecCenter.types";

// ── Low-level ICS helpers ─────────────────────────────────────────────────────

function unfoldLines(raw: string): string[] {
  return raw
    .replace(/\r\n[ \t]/g, "")   // RFC 5545 CRLF fold
    .replace(/\r\n/g, "\n")
    .replace(/\n[ \t]/g, "")     // bare-LF fold (some CSUN feeds)
    .split("\n")
    .filter((l) => l.length > 0);
}

function parseIcsDate(value: string, params: string): Date | null {
  if (!value) return null;

  // All-day VALUE=DATE → YYYYMMDD
  if (params.includes("VALUE=DATE") || value.length === 8) {
    const y  = +value.slice(0, 4);
    const mo = +value.slice(4, 6) - 1;
    const d  = +value.slice(6, 8);
    return new Date(Date.UTC(y, mo, d));
  }

  // UTC: ends with Z
  if (value.endsWith("Z")) {
    return new Date(
      `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}` +
        `T${value.slice(9, 11)}:${value.slice(11, 13)}:${value.slice(13, 15)}Z`
    );
  }

  // TZID or floating — store wall-clock digits as UTC for consistent display
  const y  = +value.slice(0, 4);
  const mo = +value.slice(4, 6) - 1;
  const d  = +value.slice(6, 8);
  const h  = value.length > 8 ? +value.slice(9, 11)  : 0;
  const mi = value.length > 8 ? +value.slice(11, 13) : 0;
  const s  = value.length > 8 ? +value.slice(13, 15) : 0;
  return new Date(Date.UTC(y, mo, d, h, mi, s));
}

function unescapeIcs(val: string): string {
  return val
    .replace(/\\n/g, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\")
    .trim();
}

// ── Main parser ───────────────────────────────────────────────────────────────

export function parseIcs(raw: string): SRCEvent[] {
  const lines  = unfoldLines(raw);
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
      const isAllDay   = dtStartKey.includes("VALUE=DATE") ||
        (r[dtStartKey]?.length === 8); // bare 8-char date = all-day
      const startTime  = dtStartKey ? parseIcsDate(r[dtStartKey], dtStartKey) : null;
      const endTime    = dtEndKey   ? parseIcsDate(r[dtEndKey],   dtEndKey)   : null;

      // GEO
      let geo: SRCEvent["geo"] = null;
      if (r["GEO"]) {
        const [lat, lng] = r["GEO"].split(";").map(Number);
        if (!isNaN(lat) && !isNaN(lng)) geo = { lat, lng };
      }

      // Image from ATTACH (FMTTYPE=image/... or bare URL)
      const attachKey = Object.keys(r).find((k) => k.startsWith("ATTACH"));
      let imageUrl: string | null = null;
      if (attachKey) {
        const val = r[attachKey] ?? "";
        // Only use as imageUrl if it looks like an image URL
        if (val.match(/\.(jpg|jpeg|png|gif|webp)(\?.*)?$/i) || attachKey.includes("FMTTYPE=image")) {
          imageUrl = val;
        }
      }

      // Organizer CN
      const orgKey = Object.keys(r).find((k) => k.startsWith("ORGANIZER"));
      let organizer: string | null = null;
      if (orgKey) {
        const cnMatch = orgKey.match(/CN="?([^";]+)"?/);
        organizer = cnMatch ? cnMatch[1].trim() : null;
      }

      // Build UID — append start date so recurring occurrences are unique
      const baseUid = r["UID"] ?? `generated_${Date.now()}_${Math.random()}`;
      const uid = startTime
        ? `${baseUid}_${startTime.toISOString().slice(0, 10)}`
        : baseUid;

      events.push({
        uid,
        title:       unescapeIcs(r["SUMMARY"]      ?? ""),
        description: unescapeIcs(r["DESCRIPTION"]  ?? ""),
        location:    unescapeIcs(r["LOCATION"]      ?? ""),
        startTime,
        endTime,
        isAllDay,
        url:         r["URL"]        ?? "",
        imageUrl,
        categories:  r["CATEGORIES"]
          ? r["CATEGORIES"].split(",").map((c) => c.trim())
          : [],
        organizer,
        geo,
        createdAt:   r["CREATED"]
          ? parseIcsDate(r["CREATED"], "")        ?? new Date()
          : new Date(),
        updatedAt:   r["LAST-MODIFIED"]
          ? parseIcsDate(r["LAST-MODIFIED"], "")  ?? new Date()
          : new Date(),
      });

      current = null;
      continue;
    }

    if (!current) continue;

    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;
    const keyPart = line.slice(0, colonIdx);
    const val     = line.slice(colonIdx + 1);
    current._raw[keyPart] = val;
  }

  return events;
}

// ── Category inference ────────────────────────────────────────────────────────

const CATEGORY_KEYWORDS: Record<SRCClassCategory, string[]> = {
  Aquatics: [
    "swim", "pool", "aquatic", "beginner lessons", "intermediate lessons",
    "children", "children's", "adult swim", "lap swim", "water polo",
    "adult group swim", "swim lesson",
  ],
  "Group Exercise": [
    "yoga", "hiit", "zumba", "cardio", "pilates", "barre", "sweatchella",
    "fitness", "stretch", "abs", "core", "spin", "cycle", "boot camp",
    "bootcamp", "group exercise", "group fitness", "aerobic", "dance fit",
    "body pump", "body combat", "strong", "power", "tabata",
  ],
  Boxing: [
    "boxing", "bag work", "heavy bag", "pads", "gloves", "muay thai", "kickbox",
  ],
  Intramural: [
    "intramural", "basketball", "volleyball", "soccer", "softball",
    "ultimate frisbee", "night hits", "flag football", "dodgeball", "tennis",
    "badminton", "ping pong", "table tennis", "sports season",
  ],
  "Outdoor Adventures": [
    "outdoor", "rock wall", "ridge", "bouldering", "climbing", "hiking",
    "kayak", "surf", "adventure", "rappel", "backpack", "trail",
  ],
  "Special Event": [
    "tournament", "guilty gear", "smash", "fifa", "billiards",
    "games room", "open house", "cpr", "first-aid", "first aid", "aed",
    "red cross", "membership", "orientation", "grand opening", "showcase",
    "expo", "spring", "fall", "semester", "camp", "locker", "renewal",
    "certification", "lifeguard", "special event",
  ],
  Other: [],
};

export function inferCategory(title: string, location: string): SRCClassCategory {
  const haystack = `${title} ${location}`.toLowerCase();
  for (const [cat, keywords] of Object.entries(CATEGORY_KEYWORDS) as [SRCClassCategory, string[]][]) {
    if (cat === "Other") continue;
    if (keywords.some((kw) => haystack.includes(kw))) return cat;
  }
  return "Other";
}

// ── Convert SRCEvent → SRCScheduleClass (timed events only) ──────────────────
//
// All-day events (CPR classes, Intramural season) are excluded here — they
// appear in the EventsBanner instead (no grid slot).

export function eventsToScheduleClasses(events: SRCEvent[]): SRCScheduleClass[] {
  const DAY_NAMES = [
    "Sunday", "Monday", "Tuesday", "Wednesday",
    "Thursday", "Friday", "Saturday",
  ];

  return events
    .filter((e) => !e.isAllDay && e.startTime !== null)
    .map((e) => {
      const start  = e.startTime!;
      const rawEnd = e.endTime ?? e.startTime!;
      const end    =
        rawEnd.getTime() === start.getTime()
          ? new Date(start.getTime() + 60 * 60 * 1000)
          : rawEnd;

      const fmt = (d: Date) =>
        `${String(d.getUTCHours()).padStart(2, "0")}:${String(
          d.getUTCMinutes()
        ).padStart(2, "0")}`;

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

// ── Filter schedule classes by week ──────────────────────────────────────────
//
// weekStart: "YYYY-MM-DD" Sunday of the desired week.
// Window is [Sunday 00:00 UTC, Saturday 23:59:59 UTC] inclusive on both ends.

export function filterClassesByWeek(
  events: SRCEvent[],
  weekStart: string
): SRCScheduleClass[] {
  const start = new Date(`${weekStart}T00:00:00Z`);
  const end   = new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000 - 1);

  const weekEvents = events.filter((e) => {
    if (!e.startTime) return false;
    const t = e.startTime.getTime();
    return t >= start.getTime() && t <= end.getTime();
  });

  return eventsToScheduleClasses(weekEvents);
}

// ── Group events by base title (for recurring display) ────────────────────────

export function groupEventsByTitle(events: SRCEvent[]): Map<string, SRCEvent[]> {
  const map = new Map<string, SRCEvent[]>();
  for (const e of events) {
    const key = e.title.trim().toLowerCase();
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(e);
  }
  return map;
}
