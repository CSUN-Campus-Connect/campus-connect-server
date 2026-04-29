// src/modules/event/external/StudentRecCenter/studentRecCenter.types.ts

export interface SRCEvent {
  uid: string;
  title: string;
  description: string;
  location: string;
  startTime: Date | null; // null = all-day
  endTime: Date | null;
  isAllDay: boolean;
  url: string;
  imageUrl: string | null;
  categories: string[];
  organizer: string | null;
  geo: { lat: number; lng: number } | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface SRCScheduleClass {
  id: string;           // derived from UID
  title: string;
  instructor: string | null;
  location: string;
  day: string;          // e.g. "Monday"
  startTime: string;    // e.g. "08:00"
  endTime: string;      // e.g. "09:00"
  category: SRCClassCategory;
  description: string;
  registrationUrl: string;
  imageUrl: string | null;
  spots: number | null; // null = unlimited / unknown
}

export type SRCClassCategory =
  | "Aquatics"
  | "Group Exercise"
  | "Boxing"
  | "Intramural"
  | "Outdoor Adventures"
  | "Special Event"
  | "Other";

// What the frontend sends when a user clicks "Add to Calendar"
export interface AddToCalendarDto {
  eventUid: string;       // matches SRCEvent.uid
  userEmail: string;      // send ICS attachment here
  // Optional overrides (populated from event data by default)
  title?: string;
  description?: string;
  location?: string;
  startTime?: string;     // ISO 8601
  endTime?: string;       // ISO 8601
}

export interface AddToCalendarResult {
  success: boolean;
  message: string;
  icsDownloadUrl?: string; // presigned URL or data URI fallback
}

// What the frontend sends when saving a weekly class slot
export interface SaveScheduleClassDto {
  classId: string;
  className: string;
  dayOfWeek: number;    // 0 = Sunday … 6 = Saturday
  startTime: string;    // "HH:mm"
  endTime: string;
  location: string;
  instructor: string | null;
  category: SRCClassCategory;
  weekStart: string;    // ISO date of week's Sunday, e.g. "2026-04-27"
}

export interface SaveScheduleClassResult {
  success: boolean;
  message: string;
  userScheduleId?: string;
}

// Cached feed state stored in memory / Redis
export interface SRCFeedCache {
  events: SRCEvent[];
  fetchedAt: Date;
  etag: string | null;
}

// Query params accepted by GET /events
export interface GetEventsQuery {
  category?: SRCClassCategory;
  from?: string;    // ISO date
  to?: string;      // ISO date
  search?: string;
}

// Query params accepted by GET /schedule
export interface GetScheduleQuery {
  day?: string;   // e.g. "Monday"
  week?: string;  // ISO date for week start, e.g. "2026-04-27"
}
