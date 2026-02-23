import prisma from "@/utils/prisma";
import { EventData, PublicEvent } from "./event.types";

export const createEvent = async (eventData: EventData): Promise<PublicEvent> => {
  const newEvent = await prisma.event.create({
    data: {
      title: eventData.title,
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