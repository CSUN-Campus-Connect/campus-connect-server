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
      createdBy: { connect: { id: eventData.createdById } },
      isPublic: true,
    },
  });

  if (!newEvent) throw new Error("Event not created with data: " + eventData);

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

export const getEventById = async (id: string): Promise<PublicEvent | null> => {
  const event = await prisma.event.findUnique({
    where: { id },
  });

  return event;
};

export const updateEvent = async (id: string, eventData: EventData): Promise<PublicEvent> => {

  const updatedEvent = await prisma.event.update({
    where: { 
      id: id,
      createdById: eventData.createdById 
    },
    data: {
      title: eventData.title,
      description: eventData.description,
      startDate: new Date(eventData.startDate),
      endDate: new Date(eventData.endDate),
      location: eventData.location,
      banner: eventData.banner,
    },
  });

  return updatedEvent;
}

export const deleteEvent = async (id: string, userId: string): Promise<PublicEvent> => {
  const deletedEvent = await prisma.event.delete({
    where: { id: id, createdById: userId },
  });
  
  return deletedEvent;
}
  