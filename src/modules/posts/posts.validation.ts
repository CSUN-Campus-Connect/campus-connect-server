import { z } from "zod";

export const createPostSchema = z.object({
  body: z.object({
    content: z
      .string()
      .min(1, "Post content is required")
      .max(500, "Post cannot exceed 500 characters"),
    images: z
      .array(z.string().url("Invalid image URL"))
      .max(4, "Maximum 4 images allowed")
      .optional()
      .default([]),
  }),
});

export const createCommentSchema = z.object({
  body: z.object({
    content: z
      .string()
      .min(1, "Comment content is required")
      .max(300, "Comment cannot exceed 300 characters"),
  }),
});

export const createRepostSchema = z.object({
  body: z
    .object({
      repostComment: z
        .string()
        .max(500, "Quote comment cannot exceed 500 characters")
        .optional(),
    })
    .optional()
    .default({}),
});