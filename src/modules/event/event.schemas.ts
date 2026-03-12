import { z } from "zod";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";

extendZodWithOpenApi(z);

export const createEventSchema = z.object({
  body: z.object({
    title: z
      .string()
      .min(1, { message: "Title can't be empty" })
      .max(100, { message: "Title must not exceed 100 characters" })
      .meta({
        id: "Title",
        description: "Title of the event",
        example: "Campus Meetup",
      }),
    description: z.string().optional().meta({
      id: "Description",
      description: "Description of the event",
      example: "An event to meet fellow students",
    }),
    startDate: z.iso.datetime({ message: "Invalid start date format" }).meta({
      id: "Start Date",
      description: "Start date and time of the event",
      example: "2024-12-31T18:00:00Z",
    }),
    endDate: z.iso.datetime({ message: "Invalid end date format" }).meta({
      id: "End Date",
      description: "End date and time of the event",
      example: "2024-12-31T20:00:00Z",
    }),
    location: z.string().optional().meta({
      id: "Location",
      description: "Location of the event",
      example: "Jacranada Hall",
    }),
    banner: z.url({ message: "Banner must be a valid URL" }).optional().meta({
      id: "Banner",
      description: "URL of the event banner",
      example: "https://example.com/banner.jpg",
    }),
  }),
});

export const createEventSuccessSchema = z.object({
  message: z.string().meta({
    id: "Event Created Message",
    example: "Event created successfully",
  }),
  event: createEventSchema.shape.body,
});

export const publicEventSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  startDate: z.date(),
  endDate: z.date(),
  location: z.string().nullable(),
  url: z.url().nullable(),
  banner: z.url().nullable(),
  createdAt: z.date(),
});

export const getEventsByDateRangeSuccessSchema = z.object({
  total: z.number().meta({
    id: "Total",
    description: "Total number of events",
    example: 10,
  }),
  data: z.array(publicEventSchema).meta({
    id: "Data",
    description: "Array of events",
  }),
});