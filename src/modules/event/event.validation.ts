import { z } from "zod";

export const createEventSchema = z.object({
  body: z.object({
    title: z
      .string({ message: "Title is required" })
      .min(3, { message: "Title must be at least 3 characters" })
      .max(100, { message: "Title must not exceed 100 characters" }),

    description: z
      .string()
      .max(500, { message: "Description must not exceed 500 characters" })
      .optional(),

    startDate: z.iso.datetime({ message: "Invalid start date format" }),

    endDate: z.iso.datetime({ message: "Invalid end date format" }),

    location: z
      .string()
      .max(200, { message: "Location must not exceed 200 characters" })
      .optional(),

    banner: z
      .string()
      .url({ message: "Banner must be a valid URL" })
      .optional(),
  }),
});

export const getEventsByDateRangeSchema = z.object({
  query: z.object({
    rangeStart: z.coerce.date({ message: "Invalid start date format" }),
    rangeEnd: z.coerce.date({ message: "Invalid end date format" }),
  }),
});

export const getEventByIdSchema = z.object({
  params: z.object({
    id: z.string({ message: "Event ID is required" }),
  }),
});
