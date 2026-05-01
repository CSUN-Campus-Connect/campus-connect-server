// src/modules/event/external/StudentRecCenter/studentRecCenter.parser.ts

import { SRCEvent, SRCClassCategory, SRCScheduleClass } from "./studentRecCenter.types";

function unfoldLines(raw: string): string[] {
  return raw
    .replace(/\r\n[ \t]/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/\n[ \t]/g, "")
    .split("\n")
    .filter((l) => l.length > 0);
}

function parseIcsDate(value: string, params: string): Date | null {
  if (!value) return null;

  if (params.includes("VALUE=DATE") || value.length === 8) {
    const y = +value.slice(0, 4);
    const mo = +value.slice(4, 6) - 1;
    const d = +value.slice(6, 8);
    return new Date(Date.UTC(y, mo, d));
  }

  if (value.endsWith("Z")) {
    return new Date(
      `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}T${value.slice(9, 11)}:${value.slice(11, 13)}:${value.slice(13, 15)}Z`
    );
  }

  const y = +value.slice(0, 4);
  const mo = +value.slice(4, 6) - 1;
  const d = +value.slice(6, 8);
  const h = value.length > 8 ? +value.slice(9, 11) : 0;
  const mi = value.length > 8 ? +value.slice(11, 13) : 0;
  const s = value.length > 8 ? +value.slice(13, 15) : 0;
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
      const dtEndKey = Object.keys(r).find((k) => k.startsWith("DTEND")) ?? "";
      const isAllDay = dtStartKey.includes("VALUE=DATE") || (r[dtStartKey]?.length === 8);
      const startTime = dtStartKey ? parseIcsDate(r[dtStartKey], dtStartKey) : null;
      const endTime = dtEndKey ? parseIcsDate(r[dtEndKey], dtEndKey) : null;

      let geo: SRCEvent["geo"] = null;
      if (r["GEO"]) {
        const [lat, lng] = r["GEO"].split(";").map(Number);
        if (!isNaN(lat) && !isNaN(lng)) geo = { lat, lng };
      }

      const attachKey = Object.keys(r).find((k) => k.startsWith("ATTACH"));
      let imageUrl: string | null = null;
      if (attachKey) {
        const val = r[attachKey] ?? "";
        if (val.match(/\.(jpg|jpeg|png|gif|webp)(\?.*)?$/i) || attachKey.includes("FMTTYPE=image")) {
          imageUrl = val;
        }
      }

      const orgKey = Object.keys(r).find((k) => k.startsWith("ORGANIZER"));
      let organizer: string | null = null;
      if (orgKey) {
        const cnMatch = orgKey.match(/CN="?([^";]+)"?/);
        organizer = cnMatch ? cnMatch[1].trim() : null;
      }

      const baseUid = r["UID"] ?? `generated_${Date.now()}_${Math.random()}`;
      const uid = startTime ? `${baseUid}_${startTime.toISOString().slice(0, 10)}` : baseUid;

      events.push({
        uid,
        title: unescapeIcs(r["SUMMARY"] ?? ""),
        description: unescapeIcs(r["DESCRIPTION"] ?? ""),
        location: unescapeIcs(r["LOCATION"] ?? ""),
        startTime,
        endTime,
        isAllDay,
        url: r["URL"] ?? "",
        imageUrl,
        categories: r["CATEGORIES"] ? r["CATEGORIES"].split(",").map((c) => c.trim()) : [],
        organizer,
        geo,
        createdAt: r["CREATED"] ? parseIcsDate(r["CREATED"], "") ?? new Date() : new Date(),
        updatedAt: r["LAST-MODIFIED"] ? parseIcsDate(r["LAST-MODIFIED"], "") ?? new Date() : new Date(),
      });

      current = null;
      continue;
    }

    if (!current) continue;
    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;
    const keyPart = line.slice(0, colonIdx);
    const val = line.slice(colonIdx + 1);
    current._raw[keyPart] = val;
  }

  return events;
}

const CATEGORY_KEYWORDS: Record<SRCClassCategory, string[]> = {
  Aquatics: ["swim", "pool", "aquatic", "beginner lessons", "intermediate lessons", "children", "children's", "adult swim", "lap swim", "water polo", "adult group swim", "swim lesson"],
  "Group Exercise": ["yoga", "hiit", "zumba", "cardio", "pilates", "barre", "sweatchella", "fitness", "stretch", "abs", "core", "spin", "cycle", "boot camp", "bootcamp", "group exercise", "group fitness", "aerobic", "dance fit", "body pump", "body combat", "strong", "power", "tabata"],
  Boxing: ["boxing", "bag work", "heavy bag", "pads", "gloves", "muay thai", "kickbox"],
  Intramural: ["intramural", "basketball", "volleyball", "soccer", "softball", "ultimate frisbee", "night hits", "flag football", "dodgeball", "tennis", "badminton", "ping pong", "table tennis", "sports season"],
  "Outdoor Adventures": ["outdoor", "rock wall", "ridge", "bouldering", "climbing", "hiking", "kayak", "surf", "adventure", "rappel", "backpack", "trail"],
  "Special Event": ["tournament", "guilty gear", "smash", "fifa", "billiards", "games room", "open house", "cpr", "first-aid", "first aid", "aed", "red cross", "membership", "orientation", "grand opening", "showcase", "expo", "spring", "fall", "semester", "camp", "locker", "renewal", "certification", "lifeguard", "special event"],
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

function toDayName(dayIdx: number): string {
  return ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][dayIdx] ?? "Sunday";
}

function formatUtcHHmm(d: Date): string {
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function normalizeDescription(description: string): string {
  return description
    .replace(/\u00a0/g, " ")
    .replace(/[“”]/g, '"')
    .replace(/[’]/g, "'")
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function getShortDescription(description: string, fallback = ""): string {
  const cleaned = normalizeDescription(description)
    .replace(/Register.*$/i, "")
    .replace(/Continue reading.*$/i, "")
    .trim();
  if (!cleaned) return fallback;
  if (cleaned.length <= 110) return cleaned;
  return `${cleaned.slice(0, 107).trimEnd()}...`;
}

export function eventsToScheduleClasses(events: SRCEvent[]): SRCScheduleClass[] {
  return events
    .filter((e) => !e.isAllDay && e.startTime !== null)
    .map((e) => {
      const start = e.startTime!;
      const rawEnd = e.endTime ?? e.startTime!;
      const end = rawEnd.getTime() === start.getTime() ? new Date(start.getTime() + 60 * 60 * 1000) : rawEnd;
      return {
        id: e.uid,
        title: e.title,
        instructor: e.organizer,
        location: e.location.split(",")[0].trim(),
        day: toDayName(start.getUTCDay()),
        startTime: formatUtcHHmm(start),
        endTime: formatUtcHHmm(end),
        category: inferCategory(e.title, e.location),
        description: e.description,
        shortDescription: getShortDescription(e.description, e.location.split(",")[0].trim()),
        registrationUrl: e.url,
        imageUrl: e.imageUrl,
        spots: null,
        kind: inferCategory(e.title, e.location) === "Special Event" ? "event" : "class",
      } satisfies SRCScheduleClass;
    });
}

function parseTimeRange(value: string): { start: string; end: string } | null {
  const normalized = value
    .toLowerCase()
    .replace(/[–—]/g, "-")
    .replace(/\./g, "")
    .replace(/\s+/g, " ")
    .trim();

  const m = normalized.match(/(\d{1,2})(?::(\d{2}))?\s*-\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)/);
  if (!m) return null;

  const startHourRaw = Number(m[1]);
  const startMin = Number(m[2] ?? "0");
  const endHourRaw = Number(m[3]);
  const endMin = Number(m[4] ?? "0");
  const meridiem = m[5];

  const convert = (hour: number, minute: number) => {
    let h = hour % 12;
    if (meridiem === "pm") h += 12;
    return `${String(h).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  };

  let start = convert(startHourRaw, startMin);
  let end = convert(endHourRaw, endMin);
  if (end <= start) {
    const [eh, em] = end.split(":").map(Number);
    end = `${String((eh + 12) % 24).padStart(2, "0")}:${String(em).padStart(2, "0")}`;
  }
  return { start, end };
}

function parseMonthDay(text: string, year: number): string | null {
  const m = text.match(/(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})/i);
  if (!m) return null;
  const months = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
  const month = months.indexOf(m[1].toLowerCase());
  if (month === -1) return null;
  return new Date(Date.UTC(year, month, Number(m[2]))).toISOString().slice(0, 10);
}

function lineToOccurrence(
  sourceEvent: SRCEvent,
  sectionTitle: string,
  sectionLocation: string,
  sectionRange: { from: string | null; to: string | null },
  line: string,
  weekStartDate: Date,
): SRCScheduleClass | null {
  const dayMatch = line.match(/(Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday)s?/i);
  if (!dayMatch) return null;
  const time = parseTimeRange(line);
  if (!time) return null;

  const dayName = dayMatch[1][0].toUpperCase() + dayMatch[1].slice(1).toLowerCase();
  const dayIndex = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].indexOf(dayName);
  if (dayIndex === -1) return null;

  const occurrenceDate = new Date(weekStartDate.getTime() + dayIndex * 24 * 60 * 60 * 1000);
  const occurrenceIso = toIsoDate(occurrenceDate);

  if (sectionRange.from && occurrenceIso < sectionRange.from) return null;
  if (sectionRange.to && occurrenceIso > sectionRange.to) return null;

  const rolePrefix = line.split(":")[0]?.trim() ?? "";
  const cleanedRole = rolePrefix && !/^(Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday)/i.test(rolePrefix)
    ? rolePrefix.replace(/\s+/g, " ").trim()
    : "";

  const titleParts = [sectionTitle, cleanedRole].filter(Boolean);
  const title = titleParts.join(" · ");
  const detail = line.replace(/\s+/g, " ").trim();

  return {
    id: `${sourceEvent.uid}_${sectionTitle.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}_${dayName.toLowerCase()}_${time.start}`,
    title: title || sourceEvent.title,
    instructor: sourceEvent.organizer,
    location: sectionLocation || sourceEvent.location.split(",")[0].trim(),
    day: dayName,
    startTime: time.start,
    endTime: time.end,
    category: inferCategory(`${sourceEvent.title} ${sectionTitle}`, `${sectionLocation} ${sourceEvent.location}`),
    description: `${sectionTitle}${cleanedRole ? ` ${cleanedRole}` : ""}. ${detail}`,
    shortDescription: getShortDescription(`${sectionTitle}${cleanedRole ? ` ${cleanedRole}` : ""}. ${detail}`),
    registrationUrl: sourceEvent.url,
    imageUrl: sourceEvent.imageUrl,
    spots: null,
    kind: "class",
  };
}

export function expandRecurringScheduleClasses(events: SRCEvent[], weekStart: string): SRCScheduleClass[] {
  const weekStartDate = new Date(`${weekStart}T00:00:00Z`);
  const weekEndIso = new Date(weekStartDate.getTime() + 6 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const expanded: SRCScheduleClass[] = [];

  for (const event of events) {
    if (!event.isAllDay) continue;
    if (!event.description) continue;

    const normalized = event.description
      .replace(/\u00a0/g, " ")
      .replace(/[–—]/g, "-")
      .replace(/\s{2,}/g, "\n")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    let sectionTitle = event.title;
    let sectionLocation = event.location.split(",")[0].trim();
    let sectionRange = {
      from: event.startTime ? toIsoDate(event.startTime) : null,
      to: event.endTime ? toIsoDate(new Date(event.endTime.getTime() - 24 * 60 * 60 * 1000)) : null,
    };

    for (const line of normalized) {
      const sectionMatch = line.match(/^(.+?)\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2}\s*-\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2}\s+(.*)$/i);
      if (sectionMatch) {
        sectionTitle = sectionMatch[1].trim();
        sectionLocation = sectionMatch[4].trim() || sectionLocation;
        const year = event.startTime?.getUTCFullYear() ?? weekStartDate.getUTCFullYear();
        sectionRange = {
          from: parseMonthDay(`${sectionMatch[2]} ${line.match(/\b\d{1,2}\b/)?.[0] ?? "1"}`, year),
          to: parseMonthDay(`${sectionMatch[3]} ${line.match(/-\s*[A-Za-z]+\s+(\d{1,2})/)?.[1] ?? "28"}`, year),
        };
        continue;
      }

      const occurrence = lineToOccurrence(event, sectionTitle, sectionLocation, sectionRange, line, weekStartDate);
      if (!occurrence) continue;
      const occDate = new Date(`${weekStart}T00:00:00Z`);
      occDate.setUTCDate(occDate.getUTCDate() + ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].indexOf(occurrence.day));
      const occIso = toIsoDate(occDate);
      if (occIso < weekStart || occIso > weekEndIso) continue;
      expanded.push(occurrence);
    }
  }

  return expanded;
}

export function allDayEventsToScheduleEntries(events: SRCEvent[], weekStart: string): SRCScheduleClass[] {
  const weekStartDate = new Date(`${weekStart}T00:00:00Z`);
  const weekEndDate = new Date(weekStartDate.getTime() + 7 * 24 * 60 * 60 * 1000 - 1);

  return events
    .filter((e) => e.isAllDay)
    .filter((e) => {
      const eventStart = e.startTime ?? weekStartDate;
      const eventEndExclusive = e.endTime ?? new Date(eventStart.getTime() + 24 * 60 * 60 * 1000);
      return eventStart.getTime() <= weekEndDate.getTime() && eventEndExclusive.getTime() > weekStartDate.getTime();
    })
    .map((e) => {
      const start = e.startTime ?? weekStartDate;
      const endInclusive = e.endTime ? new Date(e.endTime.getTime() - 24 * 60 * 60 * 1000) : start;
      return {
        id: e.uid,
        title: e.title,
        instructor: e.organizer,
        location: e.location.split(",")[0].trim(),
        day: toDayName(start.getUTCDay()),
        startTime: "00:00",
        endTime: "23:59",
        category: inferCategory(e.title, e.location),
        description: e.description,
        shortDescription: getShortDescription(e.description, e.location.split(",")[0].trim()),
        registrationUrl: e.url,
        imageUrl: e.imageUrl,
        spots: null,
        kind: inferCategory(e.title, e.location) === "Special Event" ? "event" : "class",
        isAllDay: true,
        startDate: toIsoDate(start),
        endDate: toIsoDate(endInclusive),
      } satisfies SRCScheduleClass;
    });
}

export function filterClassesByWeek(events: SRCEvent[], weekStart: string): SRCScheduleClass[] {
  const start = new Date(`${weekStart}T00:00:00Z`);
  const end = new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000 - 1);

  const timedWeekEvents = events.filter((e) => {
    if (!e.startTime || e.isAllDay) return false;
    const t = e.startTime.getTime();
    return t >= start.getTime() && t <= end.getTime();
  });

  const timed = eventsToScheduleClasses(timedWeekEvents);
  const recurring = expandRecurringScheduleClasses(events, weekStart);
  const allDay = allDayEventsToScheduleEntries(events, weekStart);

  const seen = new Map<string, SRCScheduleClass>();
  for (const item of [...timed, ...recurring, ...allDay]) {
    if (!seen.has(item.id)) seen.set(item.id, item);
  }

  return Array.from(seen.values());
}

export function groupEventsByTitle(events: SRCEvent[]): Map<string, SRCEvent[]> {
  const map = new Map<string, SRCEvent[]>();
  for (const e of events) {
    const key = e.title.trim().toLowerCase();
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(e);
  }
  return map;
}
