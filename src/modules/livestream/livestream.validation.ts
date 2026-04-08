import { z } from "zod";

export const createLivestreamSchema = z.object({
  body: z.object({
    title: z
      .string()
      .min(1, "Livestream title is required")
      .max(100, "Title cannot exceed 100 characters"),
  }),
});