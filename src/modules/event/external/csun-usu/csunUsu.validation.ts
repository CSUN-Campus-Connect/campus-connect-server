import { z } from "zod";

export const csunUsuQuerySchema = z.object({
  daysAhead: z.coerce.number().int().min(1).max(60).optional(),
});

