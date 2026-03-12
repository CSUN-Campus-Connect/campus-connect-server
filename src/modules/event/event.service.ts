import prisma from "@/utils/prisma";
import { EventData, PublicEvent } from "./event.types";
import { SourceType } from "@prisma/client";

export const createEvent = async (eventData: EventData): Promise<PublicEvent> => {
  const newEvent = await prisma.event.create({
    data: {
      title: eventData.title,
      source: SourceType.general,
      description: eventData.description,
      startDate: new Date(eventData.startDate),
      endDate: new Date(eventData.endDate),
      location: eventData.location,
      banner: eventData.banner,
      createdById: eventData.createdById,
    },
  });

  return newEvent;
};

export const getEventsByDateRange = async (rangeStart: Date, rangeEnd: Date): Promise<{total: number, data: PublicEvent[]}> => {
  const events = await prisma.event.findMany({
    where: {
      startDate: {
        lte: rangeEnd,
      },
      endDate: {
        gte: rangeStart,
      },
    },
    orderBy: {
      startDate: "asc",
    },
  });

  return {
    total: events.length,
    data: events,
  };
}