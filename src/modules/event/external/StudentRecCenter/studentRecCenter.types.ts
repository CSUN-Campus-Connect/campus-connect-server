// src/modules/event/external/StudentRecCenter/studentRecCenter.types.ts

export interface SRCEvent {
  uid: string;
  title: string;
  description: string;
  location: string;
  startTime: Date | null;
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
  id: string;
  title: string;
  instructor: string | null;
  location: string;
  day: string;
  startTime: string;
  endTime: string;
  category: SRCClassCategory;
  description: string;
  shortDescription?: string;
  registrationUrl: string;
  imageUrl: string | null;
  spots: number | null;
  kind?: "class" | "event";
  isAllDay?: boolean;
  startDate?: string | null;
  endDate?: string | null;
}

export type SRCClassCategory =
  | "Aquatics"
  | "Group Exercise"
  | "Boxing"
  | "Intramural"
  | "Outdoor Adventures"
  | "Special Event"
  | "Other";

export interface AddToCalendarDto {
  eventUid: string;
  userEmail: string;
  title?: string;
  description?: string;
  location?: string;
  startTime?: string;
  endTime?: string;
}

export interface AddToCalendarResult {
  success: boolean;
  message: string;
  icsDownloadUrl?: string;
}

export interface SaveScheduleClassDto {
  classId: string;
  className: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  location: string;
  instructor: string | null;
  category: SRCClassCategory;
  weekStart: string;
}

export interface SaveScheduleClassResult {
  success: boolean;
  message: string;
  userScheduleId?: string;
}

export interface SRCFeedCache {
  events: SRCEvent[];
  fetchedAt: Date;
  etag: string | null;
}

export interface GetEventsQuery {
  category?: SRCClassCategory;
  from?: string;
  to?: string;
  search?: string;
}

export interface GetScheduleQuery {
  day?: string;
  week?: string;
}
