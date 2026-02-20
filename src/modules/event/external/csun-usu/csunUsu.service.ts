// parsing logic

import { CollegeCategory, CsunUsuEvent, EventType } from "./csunUsu.types";

type RawEv = {
  id: string;
  title: string;
  start: string;
  end?: string;
  location?: string;
  description?: string;
};

const parseIcsDate = (value: string | undefined | null): string | undefined => {
  if (!value) return undefined;

  const m = value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?Z?$/);
  if (!m) {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
  }

  const [, y, mo, d, h, mi, sRaw] = m;
  const s = sRaw ?? "00";
  const isUtc = value.endsWith("Z");

  const year = Number(y);
  const month = Number(mo) - 1;
  const day = Number(d);
  const hour = Number(h);
  const minute = Number(mi);
  const second = Number(s);

  const date = isUtc
    ? new Date(Date.UTC(year, month, day, hour, minute, second))
    : new Date(year, month, day, hour, minute, second);

  return date.toISOString();
};

const unfoldLines = (ics: string): string[] => {
  return ics.split(/\r?\n/).reduce<string[]>((acc, line) => {
    if (!line) return acc;
    if (line[0] === " " && acc.length) {
      acc[acc.length - 1] += line.slice(1);
    } else {
      acc.push(line);
    }
    return acc;
  }, []);
};

export const parseIcsToRawEvents = (ics: string): RawEv[] => {
  const lines = unfoldLines(ics);

  const events: RawEv[] = [];
  let current:
    | {
        id?: string;
        title?: string;
        rawStart?: string;
        rawEnd?: string;
        location?: string;
        descriptionLines?: string[];
      }
    | null = null;

  for (const line of lines) {
    if (line.startsWith("BEGIN:VEVENT")) {
      current = { descriptionLines: [] };
      continue;
    }

    if (line.startsWith("END:VEVENT")) {
      if (current?.title && current.rawStart) {
        const startIso = parseIcsDate(current.rawStart);
        const endIso = parseIcsDate(current.rawEnd);
        const description = (current.descriptionLines ?? []).join("\n").trim();

        if (startIso) {
          events.push({
            id: current.id || `${current.title}-${startIso}`,
            title: current.title,
            start: startIso,
            end: endIso,
            location: current.location,
            description: description || undefined,
          });
        }
      }
      current = null;
      continue;
    }

    if (!current) continue;

    const [rawKey, ...rest] = line.split(":");
    if (!rawKey) continue;

    const value = rest.join(":");
    const key = rawKey.split(";")[0];

    switch (key) {
      case "UID":
        current.id = value;
        break;
      case "SUMMARY":
        current.title = value;
        break;
      case "DTSTART":
        current.rawStart = value;
        break;
      case "DTEND":
        current.rawEnd = value;
        break;
      case "LOCATION":
        current.location = value;
        break;
      case "DESCRIPTION":
        current.descriptionLines = current.descriptionLines || [];
        current.descriptionLines.push(value);
        break;
      default:
        break;
    }
  }

  return events.sort((a, b) => a.start.localeCompare(b.start));
};

const compressRecurringEvents = (events: RawEv[]): RawEv[] => {
  const byKey = new Map<string, RawEv[]>();

  for (const ev of events) {
    const key = `${ev.title.trim()}___${(ev.location ?? "").trim()}`;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key)!.push(ev);
  }

  const compressed: RawEv[] = [];

  for (const [, group] of byKey) {
    group.sort((a, b) => a.start.localeCompare(b.start));

    let current: RawEv = { ...group[0] };

    for (let i = 1; i < group.length; i++) {
      const ev = group[i];

      const currentEnd = new Date(current.end ?? current.start);
      currentEnd.setHours(0, 0, 0, 0);

      const evStart = new Date(ev.start);
      evStart.setHours(0, 0, 0, 0);

      const dayDiff = Math.round((evStart.getTime() - currentEnd.getTime()) / (24 * 60 * 60 * 1000));

      if (dayDiff >= 0 && dayDiff <= 1) {
        const evEndIso = ev.end ?? ev.start;
        if (!current.end || new Date(evEndIso).getTime() > new Date(current.end).getTime()) {
          current.end = evEndIso;
        }
      } else {
        compressed.push(current);
        current = { ...ev };
      }
    }

    compressed.push(current);
  }

  return compressed.sort((a, b) => a.start.localeCompare(b.start));
};


const blob = (e: { title: string; description?: string; location?: string }) =>
  `${e.title}\n${e.description ?? ""}\n${e.location ?? ""}`.toLowerCase();

const hasAny = (h: string, words: string[]) => words.some((w) => h.includes(w));

export const inferEventType = (e: RawEv): EventType => {
  const t = blob(e);

  if (hasAny(t, ["free food", "food", "pizza", "tacos", "lunch", "dinner", "snack", "bbq"])) return "Food";
  if (hasAny(t, ["game", "tournament", "match", "basketball", "soccer", "volleyball", "fitness", "run", "gym"])) return "Sports";
  if (hasAny(t, ["study", "review", "workshop", "lecture", "seminar", "lab", "tutoring", "exam"])) return "Academics";
  if (hasAny(t, ["career", "internship", "resume", "linkedin", "job", "recruit", "networking", "interview"])) return "Career";
  if (hasAny(t, ["concert", "music", "dance", "theater", "film", "gallery", "art"])) return "Arts";
  if (hasAny(t, ["volunteer", "service", "donation", "fundraiser"])) return "Volunteer";
  if (hasAny(t, ["social", "mixer", "hangout", "club", "meet", "community", "party"])) return "Social";

  return "Other";
};

export const inferCollegeCategory = (e: RawEv): CollegeCategory => {
  const t = blob(e);

  if (hasAny(t, ["engineering", "computer science", "comp", "ece", "mechanical", "civil"])) return "Engineering";
  if (hasAny(t, ["business", "accounting", "finance", "marketing", "management"])) return "Business";
  if (hasAny(t, ["art", "music", "cinema", "film", "media", "journalism", "design", "theater"])) return "Arts & Media";
  if (hasAny(t, ["biology", "chem", "chemistry", "physics", "math", "statistics", "geology"])) return "Science & Math";
  if (hasAny(t, ["health", "kinesiology", "nutrition", "psych", "child", "family", "hhd"])) return "Health & Human Development";
  if (hasAny(t, ["education", "teaching", "credential"])) return "Education";
  if (hasAny(t, ["sociology", "political", "anthropology", "economics", "social science"])) return "Social & Behavioral Sciences";

  return "General Campus";
};

export const toCsunUsuEvents = (raw: RawEv[]): CsunUsuEvent[] => {
  return raw.map((e) => ({
    ...e,
    eventType: inferEventType(e),
    collegeCategory: inferCollegeCategory(e),
  }));
};

export const fetchCsunUsuEvents = async (icsUrl: string): Promise<CsunUsuEvent[]> => {
  const res = await fetch(icsUrl, { headers: { "User-Agent": "CampusSocialApp/1.0" } });
  if (!res.ok) throw new Error("Failed to fetch CSUN USU calendar feed");

  const ics = await res.text();
  const raw = parseIcsToRawEvents(ics);
  const compressedRaw = compressRecurringEvents(raw);
  return toCsunUsuEvents(compressedRaw);
};
