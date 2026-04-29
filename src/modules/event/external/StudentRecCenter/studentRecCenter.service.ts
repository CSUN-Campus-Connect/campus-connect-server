// src/modules/event/external/StudentRecCenter/studentRecCenter.service.ts

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

// ── Feed URL ─────────────────────────────────────────────────────────────────
const SRC_ICS_URL =
  process.env.CSUN_SRC_ICS_URL ??
  "https://news.csun.edu/events/category/usu/src/?ical=1";

// Cache TTL: 1 hour (matches the ICS feed's REFRESH-INTERVAL)
const CACHE_TTL_MS = 60 * 60 * 1000;

// ── In-memory cache (swap for Redis in production) ───────────────────────────
let cache: SRCFeedCache | null = null;

// ── Private helpers ──────────────────────────────────────────────────────────

async function fetchFeed(): Promise<SRCEvent[]> {
  const headers: Record<string, string> = {
    "User-Agent": "CampusConnect/1.0 (campus-connect@csun.edu)",
    Accept: "text/calendar",
  };

  // Conditional GET — skip re-download when feed hasn't changed
  if (cache?.etag) headers["If-None-Match"] = cache.etag;

  const res = await axios.get<string>(SRC_ICS_URL, {
    headers,
    responseType: "text",
    validateStatus: (s) => s === 200 || s === 304,
    timeout: 10_000,
  });

  if (res.status === 304 && cache) {
    cache.fetchedAt = new Date();
    return cache.events;
  }

  const events = parseIcs(res.data);
  cache = {
    events,
    fetchedAt: new Date(),
    etag: (res.headers["etag"] as string | undefined) ?? null,
  };
  return events;
}

async function getEvents(): Promise<SRCEvent[]> {
  const now = Date.now();
  if (cache && now - cache.fetchedAt.getTime() < CACHE_TTL_MS) {
    return cache.events;
  }
  return fetchFeed();
}

// ── ICS builder (for Add-to-Calendar) ────────────────────────────────────────

function formatIcsDate(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
}

function buildIcsString(event: SRCEvent, overrides: Partial<AddToCalendarDto> = {}): string {
  const title    = overrides.title       ?? event.title;
  const desc     = overrides.description ?? event.description;
  const location = overrides.location    ?? event.location;
  const start    = overrides.startTime ? new Date(overrides.startTime) : event.startTime ?? new Date();
  const end      = overrides.endTime
    ? new Date(overrides.endTime)
    : event.endTime ?? new Date(start.getTime() + 60 * 60 * 1000);

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
   * GET /event/external/src/events
   * All upcoming (and all-day) SRC events, sorted by start time.
   */
  async getAllEvents(): Promise<SRCEvent[]> {
    const events = await getEvents();
    const now = new Date();
    return events
      .filter((e) => (e.startTime ?? new Date(0)) >= now || e.isAllDay)
      .sort((a, b) => (a.startTime?.getTime() ?? 0) - (b.startTime?.getTime() ?? 0));
  },

  /**
   * GET /event/external/src/events?category=&from=&to=&search=
   */
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

  /**
   * GET /event/external/src/schedule?day=Monday&week=2026-04-27
   * Returns timed events formatted as weekly schedule classes.
   * If `week` is omitted, returns classes for the current ISO week.
   */
  async getScheduleClasses(params?: GetScheduleQuery): Promise<SRCScheduleClass[]> {
    const events = await this.getAllEvents();

    let classes: SRCScheduleClass[];

    if (params?.week) {
      classes = filterClassesByWeek(events, params.week);
    } else {
      classes = eventsToScheduleClasses(events);
    }

    if (params?.day) {
      classes = classes.filter(
        (c) => c.day.toLowerCase() === params.day!.toLowerCase()
      );
    }

    return classes;
  },

  /**
   * GET /event/external/src/events/:uid
   */
  async getEventByUid(uid: string): Promise<SRCEvent | null> {
    const events = await getEvents();
    return events.find((e) => e.uid === uid) ?? null;
  },

  /**
   * POST /event/external/src/calendar/add
   *
   * Builds an ICS string for a specific event. The ICS can be:
   *   A) Emailed to dto.userEmail as a text/calendar attachment so the
   *      recipient's mail client shows a one-click "Add to Calendar" prompt.
   *   B) Returned as a data: URI so the frontend can trigger a browser download.
   *
   * Wire in an email provider (nodemailer / SendGrid / Resend) where indicated.
   */
  async addToCalendar(dto: AddToCalendarDto): Promise<AddToCalendarResult> {
    const event = await this.getEventByUid(dto.eventUid);
    if (!event) {
      return { success: false, message: `Event ${dto.eventUid} not found` };
    }

    const icsString = buildIcsString(event, dto);

    // ── TODO: wire your email provider here ─────────────────────────────────
    //
    // Example with nodemailer:
    //
    //   import nodemailer from "nodemailer";
    //   const transporter = nodemailer.createTransport({ /* SMTP config */ });
    //   await transporter.sendMail({
    //     from:    "noreply@campusconnect.app",
    //     to:      dto.userEmail,
    //     subject: `Added to your calendar: ${event.title}`,
    //     text:    `${event.title}\n${event.location}\n\nRegister: ${event.url}`,
    //     attachments: [{
    //       filename:    "event.ics",
    //       content:     icsString,
    //       contentType: "text/calendar; method=REQUEST",
    //     }],
    //   });
    //
    // ────────────────────────────────────────────────────────────────────────

    console.log(`[SRC] addToCalendar: would email ${dto.userEmail} ICS for "${event.title}"`);

    return {
      success: true,
      message: `Calendar invite prepared for ${dto.userEmail}`,
      icsDownloadUrl: `data:text/calendar;charset=utf-8,${encodeURIComponent(icsString)}`,
    };
  },

  /**
   * POST /event/external/src/schedule/save
   *
   * Persists a user's saved weekly class slot.
   * Replace the stub below with your DB layer (Supabase, Prisma, etc.).
   *
   * Suggested Supabase schema:
   *   user_saved_classes (
   *     id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
   *     user_id     UUID REFERENCES auth.users(id) ON DELETE CASCADE,
   *     class_id    TEXT,
   *     week_start  DATE,
   *     saved_at    TIMESTAMPTZ DEFAULT NOW(),
   *     UNIQUE (user_id, class_id, week_start)
   *   )
   */
  async saveScheduleClass(
    userId: string,
    dto: SaveScheduleClassDto
  ): Promise<SaveScheduleClassResult> {
    // ── TODO: replace with real DB insert ───────────────────────────────────
    //
    //   const { data, error } = await supabase
    //     .from("user_saved_classes")
    //     .insert({
    //       user_id:    userId,
    //       class_id:   dto.classId,
    //       week_start: dto.weekStart,
    //     })
    //     .select("id")
    //     .single();
    //   if (error?.code === "23505") {   // unique constraint
    //     return { success: false, message: "Already saved for this week" };
    //   }
    //   if (error) throw error;
    //   return { success: true, message: "Saved", userScheduleId: data.id };
    //
    // ────────────────────────────────────────────────────────────────────────

    console.log(`[SRC] saveScheduleClass: user=${userId} class=${dto.classId} week=${dto.weekStart}`);
    return {
      success: true,
      message: "Class saved to schedule (stub — wire DB)",
      userScheduleId: `stub-${dto.classId}-${dto.weekStart}`,
    };
  },

  /**
   * Bust the in-memory cache (call from admin endpoint or cron job).
   */
  invalidateCache(): void {
    cache = null;
    console.log("[SRC] Feed cache invalidated");
  },

  /**
   * GET /event/external/src/feed.ics
   * Raw ICS proxy — bypasses CORS for the frontend.
   */
  async getRawIcs(): Promise<string> {
    const res = await axios.get<string>(SRC_ICS_URL, {
      responseType: "text",
      timeout: 10_000,
    });
    return res.data;
  },
};
