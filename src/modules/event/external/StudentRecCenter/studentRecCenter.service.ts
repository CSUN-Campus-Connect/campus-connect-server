// src/modules/event/external/StudentRecCenter/studentRecCenter.service.ts
//
// FIX (2026-05-01):
//  1. Scrapes og:image from each event page (batched, polite)
//  2. getAllEvents returns ALL events: all-day multi-day + past 30d + active + upcoming
//  3. Background refresh every hour + midnight reset so daily events always current
//  4. Improved og:image regex catches more CSUN page formats
//  5. scrapeListingPage also grabs event page URLs for og:image enrichment

import axios from "axios";
import {
  parseIcs,
  eventsToScheduleClasses,
  filterClassesByWeek,
  inferCategory,
} from "./studentRecCenter.parser";
import {
  SRCEvent,
  SRCFeedCache,
  SRCScheduleClass,
  AddToCalendarDto,
  AddToCalendarResult,
  SRCClassCategory,
  SaveScheduleClassDto,
  SaveScheduleClassResult,
  GetEventsQuery,
  GetScheduleQuery,
} from "./studentRecCenter.types";

// ── Feed URLs ─────────────────────────────────────────────────────────────────
const SRC_ICS_PRIMARY =
  process.env.CSUN_SRC_ICS_URL ??
  "https://news.csun.edu/events/category/usu/src/?ical=1";

const SRC_ICS_TAG =
  process.env.CSUN_SRC_TAG_ICS_URL ??
  "https://news.csun.edu/events/tag/student-recreation-center/?ical=1";

const SRC_EXTRA_FEEDS: string[] = [
  "https://news.csun.edu/events/category/usu/src/intramural-sports/?ical=1",
  "https://news.csun.edu/events/category/usu/src/group-exercise/?ical=1",
  "https://news.csun.edu/events/category/usu/src/aquatics/?ical=1",
  "https://news.csun.edu/events/category/usu/src/special-events/?ical=1",
  "https://news.csun.edu/events/tag/src/?ical=1",
  "https://news.csun.edu/events/tag/intramural/?ical=1",
];

const CSUN_NEWS_BASE = "https://news.csun.edu";
const SRC_TAG_PAGE   = "https://news.csun.edu/events/tag/student-recreation-center/list/";

const CACHE_TTL_MS   = 60 * 60 * 1000; // 1 hour
const PAST_WINDOW_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

// ── In-memory cache ───────────────────────────────────────────────────────────
let cache: (SRCFeedCache & { tagEtag?: string | null }) | null = null;
const imageCache = new Map<string, string | null>();
let refreshTimer: ReturnType<typeof setInterval> | null = null;
let midnightTimer: ReturnType<typeof setTimeout> | null = null;

const BASE_HEADERS = {
  "User-Agent":
    "CampusConnect/1.0 (+https://campusconnect.csun.edu; campus-connect@csun.edu)",
  Accept: "text/calendar, text/html, */*",
};

// ── Fetch helpers ─────────────────────────────────────────────────────────────

async function fetchOneFeed(
  url: string,
  etag?: string | null
): Promise<{ events: SRCEvent[]; etag: string | null; notModified: boolean }> {
  const headers: Record<string, string> = { ...BASE_HEADERS };
  if (etag) headers["If-None-Match"] = etag;

  try {
    const res = await axios.get<string>(url, {
      headers,
      responseType: "text",
      validateStatus: (s) => s === 200 || s === 304,
      timeout: 20_000,
    });

    if (res.status === 304) {
      return { events: [], etag: etag ?? null, notModified: true };
    }

    const events = parseIcs(res.data);
    const newEtag = (res.headers["etag"] as string | undefined) ?? null;
    return { events, etag: newEtag, notModified: false };
  } catch (err) {
    console.error(`[SRC] Failed to fetch feed ${url}:`, (err as Error).message);
    return { events: [], etag: etag ?? null, notModified: false };
  }
}

/**
 * Scrape HTML listing page for event URLs + images.
 * Returns partial events enriched with imageUrl from og:image or featured image.
 */
async function scrapeListingPage(
  pageUrl: string
): Promise<Partial<SRCEvent>[]> {
  try {
    const res = await axios.get<string>(pageUrl, {
      headers: { ...BASE_HEADERS, Accept: "text/html" },
      responseType: "text",
      timeout: 15_000,
    });
    const html: string = res.data;
    const extras: Partial<SRCEvent>[] = [];

    // Tribe Events article blocks
    const articleRe =
      /<article[^>]+class="[^"]*type-tribe_events[^"]*"[^>]*>([\s\S]*?)<\/article>/gi;
    let article: RegExpExecArray | null;

    while ((article = articleRe.exec(html)) !== null) {
      const block = article[1];

      // Title + URL — try tribe link, then any h2 link
      const linkMatch =
        block.match(
          /<a[^>]+href="([^"]+)"[^>]*class="[^"]*tribe-event-url[^"]*"[^>]*>([^<]+)<\/a>/i
        ) ??
        block.match(/<h2[^>]*>[\s\S]*?<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
      if (!linkMatch) continue;

      const url   = linkMatch[1].trim();
      const title = linkMatch[2].replace(/<[^>]+>/g, "").trim();
      if (!title) continue;

      // Featured image
      const imgMatch =
        block.match(/class="[^"]*tribe-event-featured-image[^"]*"[\s\S]*?(?:src|data-src)="([^"]+)"/i) ??
        block.match(/class="[^"]*wp-post-image[^"]*"[\s\S]*?(?:src|data-src)="([^"]+)"/i) ??
        block.match(/<img[^>]+(?:src|data-src)="([^"]+)"/i);
      const imageUrl = imgMatch ? imgMatch[1].trim() : null;

      const slugMatch = url.match(/\/events\/([^/?#]+)\/?/);
      const uid = slugMatch ? `scraped_${slugMatch[1]}` : `scraped_${Date.now()}`;

      extras.push({ uid, title, url, imageUrl: imageUrl ?? null });
    }

    return extras;
  } catch (err) {
    console.error("[SRC] Listing page scrape failed:", (err as Error).message);
    return [];
  }
}

/**
 * Scrape og:image (or twitter:image / first img) from an event page.
 * Results are cached forever in imageCache (images don't change).
 */
async function scrapeEventImage(url: string): Promise<string | null> {
  if (!url || !url.startsWith(CSUN_NEWS_BASE)) return null;
  if (imageCache.has(url)) return imageCache.get(url)!;

  try {
    const res = await axios.get<string>(url, {
      headers: { ...BASE_HEADERS, Accept: "text/html" },
      responseType: "text",
      timeout: 10_000,
      // Only need <head> — grab first 20 KB
      maxContentLength: 20_000,
    });
    const html: string = res.data;

    // og:image
    const ogMatch =
      html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ??
      html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
    if (ogMatch) {
      const img = ogMatch[1].trim();
      imageCache.set(url, img);
      return img;
    }

    // twitter:image fallback
    const twMatch =
      html.match(/<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i) ??
      html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image["']/i);
    if (twMatch) {
      const img = twMatch[1].trim();
      imageCache.set(url, img);
      return img;
    }

    // wp-post-image / featured image in body
    const wpMatch = html.match(/class="[^"]*wp-post-image[^"]*"[^>]*(?:src|data-src)="([^"]+)"/i);
    if (wpMatch) {
      const img = wpMatch[1].trim();
      imageCache.set(url, img);
      return img;
    }

    imageCache.set(url, null);
    return null;
  } catch {
    imageCache.set(url, null);
    return null;
  }
}

async function enrichWithImages(events: SRCEvent[]): Promise<SRCEvent[]> {
  const toScrape = events.filter(
    (e) => !e.imageUrl && e.url?.startsWith(CSUN_NEWS_BASE)
  );
  if (toScrape.length === 0) return events;

  const BATCH = 5;
  const scraped = new Map<string, string | null>();

  for (let i = 0; i < toScrape.length; i += BATCH) {
    const batch = toScrape.slice(i, i + BATCH);
    const results = await Promise.all(batch.map((e) => scrapeEventImage(e.url)));
    batch.forEach((e, idx) => scraped.set(e.uid, results[idx]));
    if (i + BATCH < toScrape.length) {
      await new Promise((r) => setTimeout(r, 200)); // polite delay
    }
  }

  return events.map((e) => {
    const img = scraped.get(e.uid);
    if (img) return { ...e, imageUrl: img };
    return e;
  });
}

// ── Merge helpers ─────────────────────────────────────────────────────────────

function mergeEvents(...arrays: SRCEvent[][]): SRCEvent[] {
  const baseUid = (uid: string) => uid.replace(/_\d{4}-\d{2}-\d{2}$/, "");
  const seen = new Map<string, SRCEvent>();

  for (const arr of arrays) {
    for (const e of arr) {
      const key = `${baseUid(e.uid)}_${e.startTime?.toISOString() ?? "allday"}`;
      if (!seen.has(key)) {
        seen.set(key, e);
      } else {
        const existing = seen.get(key)!;
        let updated = existing;
        if (!existing.imageUrl && e.imageUrl) updated = { ...updated, imageUrl: e.imageUrl };
        if (!existing.description && e.description) updated = { ...updated, description: e.description };
        if (updated !== existing) seen.set(key, updated);
      }
    }
  }
  return Array.from(seen.values());
}

async function fetchAllFeeds(): Promise<SRCEvent[]> {
  const [primary, tagFeed, ...extras] = await Promise.all([
    fetchOneFeed(SRC_ICS_PRIMARY, cache?.etag),
    fetchOneFeed(SRC_ICS_TAG, cache?.tagEtag),
    ...SRC_EXTRA_FEEDS.map((url) => fetchOneFeed(url)),
  ]);

  let allFeedEvents: SRCEvent[] = mergeEvents(
    primary.events,
    tagFeed.events,
    ...extras.map((r) => r.events)
  );

  // Scrape listing page → enrich imageUrl by title match
  const listingExtras = await scrapeListingPage(SRC_TAG_PAGE);
  const titleMap = new Map<string, SRCEvent>();
  for (const e of allFeedEvents) titleMap.set(e.title.trim().toLowerCase(), e);

  for (const extra of listingExtras) {
    const key = (extra.title ?? "").trim().toLowerCase();
    if (titleMap.has(key)) {
      const existing = titleMap.get(key)!;
      if (!existing.imageUrl && extra.imageUrl) {
        titleMap.set(key, { ...existing, imageUrl: extra.imageUrl });
      }
      // Also store the canonical URL from listing for og:image scraping later
      if (!existing.url && extra.url) {
        titleMap.set(key, { ...titleMap.get(key)!, url: extra.url });
      }
    }
  }

  const merged = Array.from(titleMap.values());

  cache = {
    events: merged,
    fetchedAt: new Date(),
    etag:    primary.etag ?? null,
    tagEtag: tagFeed.etag ?? null,
  };

  console.log(
    `[SRC] Refreshed. Primary:${primary.events.length} Tag:${tagFeed.events.length} ` +
    `Extras:${extras.reduce((a, r) => a + r.events.length, 0)} Total:${merged.length}`
  );

  return merged;
}

async function getEvents(): Promise<SRCEvent[]> {
  const now = Date.now();
  if (cache && now - cache.fetchedAt.getTime() < CACHE_TTL_MS) {
    return cache.events;
  }
  return fetchAllFeeds();
}

// ── Background refresh: hourly + midnight ─────────────────────────────────────

function scheduleMidnightRefresh(): void {
  if (midnightTimer) clearTimeout(midnightTimer);
  const now = new Date();
  const nextMidnight = new Date(
    now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 1, 0
  );
  const msUntilMidnight = nextMidnight.getTime() - now.getTime();
  midnightTimer = setTimeout(async () => {
    console.log("[SRC] Midnight cache flush");
    cache = null;
    imageCache.clear();
    try { await fetchAllFeeds(); } catch (e) { console.error("[SRC] Midnight refresh failed:", e); }
    scheduleMidnightRefresh(); // reschedule for next day
  }, msUntilMidnight);
  if ((midnightTimer as any).unref) (midnightTimer as any).unref();
}

function startBackgroundRefresh(): void {
  if (refreshTimer) return;
  refreshTimer = setInterval(async () => {
    try { await fetchAllFeeds(); }
    catch (err) { console.error("[SRC] Hourly refresh failed:", err); }
  }, CACHE_TTL_MS);
  if ((refreshTimer as any).unref) (refreshTimer as any).unref();
  scheduleMidnightRefresh();
}

// ── ICS builder ───────────────────────────────────────────────────────────────

function formatIcsDate(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
}

function buildIcsString(event: SRCEvent, overrides: Partial<AddToCalendarDto> = {}): string {
  const title    = overrides.title       ?? event.title;
  const desc     = overrides.description ?? event.description;
  const location = overrides.location    ?? event.location;
  const start    = overrides.startTime ? new Date(overrides.startTime) : event.startTime ?? new Date();
  const end      = overrides.endTime   ? new Date(overrides.endTime)   : event.endTime   ?? new Date(start.getTime() + 3600_000);

  const esc = (s: string) =>
    s.replace(/\\/g, "\\\\").replace(/,/g, "\\,").replace(/;/g, "\\;").replace(/\n/g, "\\n");

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//CampusConnect//StudentRecCenter//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:REQUEST",
    "BEGIN:VEVENT",
    `UID:${event.uid}`,
    `DTSTAMP:${formatIcsDate(new Date())}`,
    `DTSTART:${formatIcsDate(start)}`,
    `DTEND:${formatIcsDate(end)}`,
    `SUMMARY:${esc(title)}`,
    `DESCRIPTION:${esc(desc)}`,
    `LOCATION:${esc(location)}`,
    `URL:${event.url}`,
    "STATUS:CONFIRMED",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}

// ── Public service ────────────────────────────────────────────────────────────

export const StudentRecCenterService = {

  /**
   * Returns ALL displayable events:
   *  - All-day / multi-day (CPR, Intramural, Membership Renewals): ALWAYS included
   *    as long as endDate >= 30 days ago
   *  - Timed events: started within past 30 days OR end time in the future
   */
  async getAllEvents(): Promise<SRCEvent[]> {
    startBackgroundRefresh();
    let events = await getEvents();

    const now        = Date.now();
    const pastCutoff = now - PAST_WINDOW_MS;

    const filtered = events.filter((e) => {
      if (e.isAllDay) {
        // Multi-day all-day: show if endTime (exclusive in ICS) >= cutoff
        // e.g. Membership Renewals May 4–15, CPR Feb 27–May 9
        const endMs = e.endTime
          ? e.endTime.getTime()
          : e.startTime
            ? e.startTime.getTime() + 86_400_000
            : now;
        return endMs >= pastCutoff;
      }

      if (!e.startTime) return false;
      const startMs = e.startTime.getTime();
      const endMs   = (e.endTime ?? new Date(startMs + 3600_000)).getTime();
      return startMs >= pastCutoff || endMs >= now;
    });

    const enriched = await enrichWithImages(filtered);

    return enriched.sort((a, b) => {
      const at = a.startTime?.getTime() ?? 0;
      const bt = b.startTime?.getTime() ?? 0;
      return at - bt;
    });
  },

  async getFilteredEvents(params: GetEventsQuery): Promise<SRCEvent[]> {
    let events = await this.getAllEvents();

    if (params.category) {
      events = events.filter(
        (e) => inferCategory(e.title, e.location) === params.category
      );
    }
    if (params.from) {
      const from = new Date(params.from);
      events = events.filter((e) => (e.startTime ?? new Date(0)) >= from);
    }
    if (params.to) {
      const to = new Date(params.to);
      events = events.filter((e) => (e.startTime ?? new Date()) <= to);
    }
    if (params.search) {
      const q = params.search.toLowerCase();
      events = events.filter(
        (e) =>
          e.title.toLowerCase().includes(q) ||
          e.description.toLowerCase().includes(q) ||
          e.location.toLowerCase().includes(q)
      );
    }
    return events;
  },

  async getScheduleClasses(params?: GetScheduleQuery): Promise<SRCScheduleClass[]> {
    startBackgroundRefresh();
    const allEvents = await this.getAllEvents();

    let weekStartStr = params?.week;
    if (!weekStartStr) {
      const now       = new Date();
      const dayOfWeek = now.getUTCDay();
      const sunday    = new Date(now);
      sunday.setUTCDate(now.getUTCDate() - dayOfWeek);
      const y  = sunday.getUTCFullYear();
      const mo = String(sunday.getUTCMonth() + 1).padStart(2, "0");
      const d  = String(sunday.getUTCDate()).padStart(2, "0");
      weekStartStr = `${y}-${mo}-${d}`;
    }

    let classes = filterClassesByWeek(allEvents, weekStartStr);

    if (params?.day) {
      classes = classes.filter(
        (c) => c.day.toLowerCase() === params.day!.toLowerCase()
      );
    }

    const DAY_ORDER = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
    classes.sort((a, b) => {
      const d = DAY_ORDER.indexOf(a.day) - DAY_ORDER.indexOf(b.day);
      return d !== 0 ? d : a.startTime.localeCompare(b.startTime);
    });

    return classes;
  },

  async getEventByUid(uid: string): Promise<SRCEvent | null> {
    const events = await getEvents();
    return events.find((e) => e.uid === uid) ?? null;
  },

  async addToCalendar(dto: AddToCalendarDto): Promise<AddToCalendarResult> {
    const event = await this.getEventByUid(dto.eventUid);
    if (!event) return { success: false, message: `Event ${dto.eventUid} not found` };
    const icsString = buildIcsString(event, dto);
    return {
      success: true,
      message: `Calendar invite prepared for ${dto.userEmail}`,
      icsDownloadUrl: `data:text/calendar;charset=utf-8,${encodeURIComponent(icsString)}`,
    };
  },

  async saveScheduleClass(userId: string, dto: SaveScheduleClassDto): Promise<SaveScheduleClassResult> {
    console.log(`[SRC] saveScheduleClass: user=${userId} class=${dto.classId} week=${dto.weekStart}`);
    return {
      success: true,
      message: "Class saved (stub — wire DB)",
      userScheduleId: `stub-${dto.classId}-${dto.weekStart}`,
    };
  },

  invalidateCache(): void {
    cache = null;
    imageCache.clear();
    console.log("[SRC] Cache invalidated");
  },

  async getRawIcs(): Promise<string> {
    const res = await axios.get<string>(SRC_ICS_PRIMARY, {
      responseType: "text",
      timeout: 15_000,
    });
    return res.data;
  },

  async warmCache(): Promise<void> {
    try {
      await fetchAllFeeds();
      console.log("[SRC] Cache warmed at startup.");
    } catch (err) {
      console.error("[SRC] Startup cache warm failed:", err);
    }
  },
};
