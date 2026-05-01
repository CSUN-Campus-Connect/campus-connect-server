// src/modules/event/external/StudentRecCenter/index.ts
export { default as srcRouter } from "./studentRecCenter.controller";
export { StudentRecCenterService } from "./studentRecCenter.service";
export { parseIcs, inferCategory, eventsToScheduleClasses, filterClassesByWeek } from "./studentRecCenter.parser";
export type {
  SRCEvent,
  SRCScheduleClass,
  SRCClassCategory,
  AddToCalendarDto,
  AddToCalendarResult,
  SaveScheduleClassDto,
  SaveScheduleClassResult,
  GetEventsQuery,
  GetScheduleQuery,
  SRCFeedCache,
} from "./studentRecCenter.types";
