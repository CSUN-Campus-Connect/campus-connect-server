import { z } from "zod";

export const getSundialByDateRangeSchema = z.object({
  query: z.object({
    rangeStart: z.coerce.date({ message: "Invalid start date format" }),
    rangeEnd: z.coerce.date({ message: "Invalid end date format" }),
    category: z
      .enum(["news", "sports", "culture", "multimedia"], {
        message:
          "Invalid category. Must be one of: news, sports, culture, multimedia",
      })
      .optional(),
  }),
});
