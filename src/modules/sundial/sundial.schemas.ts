import { z } from "zod";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";

extendZodWithOpenApi(z);

export const sundialArticleSchema = z.object({
  id: z.string().meta({
    id: "Sundial Article ID",
    description: "Unique identifier for the article",
    example: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  }),
  category: z.enum(["news", "sports", "culture", "multimedia"]).meta({
    id: "Category",
    description: "Category of the article",
    example: "news",
  }),
  title: z.string().meta({
    id: "Title",
    description: "Title of the article",
    example: "Rising costs force some CSUN students to reconsider living on campus",
  }),
  date: z.date().meta({
    id: "Date",
    description: "Publication date of the article",
  }),
  link: z.string().meta({
    id: "Link",
    description: "URL to the full article",
    example: "https://sundial.csun.edu/212121/news/rising-costs-force-some-csun-students-to-reconsider-living-on-campus/",
  }),
  image: z.string().nullable().meta({
    id: "Image",
    description: "URL to the article banner image",
    example: "https://sundial.csun.edu/wp-content/uploads/2026/04/example.jpg",
  }),
  createdAt: z.date().meta({
    id: "Created At",
    description: "Timestamp when the article was added to the database",
  }),
});

export const getSundialByDateRangeSuccessSchema = z.object({
  total: z.number().meta({
    id: "Total",
    description: "Total number of articles matching the query",
    example: 10,
  }),
  data: z.array(sundialArticleSchema).meta({
    id: "Data",
    description: "Array of sundial news articles",
  }),
});

export const getAllSundialSuccessSchema = z.object({
  total: z.number().meta({
    id: "Total",
    description: "Total number of articles",
    example: 22,
  }),
  data: z.array(sundialArticleSchema).meta({
    id: "Data",
    description: "Array of all sundial news articles",
  }),
});
