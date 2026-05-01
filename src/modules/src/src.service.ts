import logger from "../../utils/logger";

/**
 * Types matching the client's expected format
 */
export type ScheduleItem = {
  id?: string;
  title?: string;
  instructor?: string | null;
  location?: string | null;
  day?: string;
  startTime?: string;
  endTime?: string;
  category?: string;
  description?: string | null;
  shortDescription?: string | null;
  registrationUrl?: string | null;
  imageUrl?: string | null;
  spots?: number | null;
  isAllDay?: boolean;
  startDate?: string | null;
  endDate?: string | null;
  kind?: "class" | "event" | null;
};

export type EventItem = {
  uid?: string;
  title?: string;
  description?: string | null;
  location?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  url?: string | null;
  imageUrl?: string | null;
  isAllDay?: boolean;
  categories?: string[] | null;
};

/**
 * Fetch SRC schedule items
 * TODO: Connect to real SRC API or database
 */
export const getSrcSchedule = async (filters: {
  week?: string;
  day?: string;
}): Promise<ScheduleItem[]> => {
  try {
    // Placeholder: return empty array
    // In the future, this should:
    // 1. Call external SRC API
    // 2. Or query database for SRC schedule data
    logger.debug({ filters, context: "getSrcSchedule" });
    return [];
  } catch (error) {
    logger.error({ error, context: "getSrcSchedule service" });
    return [];
  }
};

/**
 * Fetch SRC events
 * TODO: Connect to real SRC API or database
 */
export const getSrcEvents = async (): Promise<EventItem[]> => {
  try {
    // Placeholder: return empty array
    // In the future, this should:
    // 1. Call external SRC API
    // 2. Or query database for SRC event data
    return [];
  } catch (error) {
    logger.error({ error, context: "getSrcEvents service" });
    return [];
  }
};
