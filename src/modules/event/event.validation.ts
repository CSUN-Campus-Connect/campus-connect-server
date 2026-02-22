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

    startDate: z
      .string({ message: "Start date is required" })
      .datetime({ message: "Invalid start date format" }),

    endDate: z
      .string({ message: "End date is required" })
      .datetime({ message: "Invalid end date format" }),

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
