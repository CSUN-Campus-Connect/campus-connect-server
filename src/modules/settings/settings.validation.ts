import { z } from "zod";

// Notification Preferences

export const updateNotificationPreferencesSchema = z.object({
  body: z
    .object({
      clubsNotifications: z.boolean().optional(),
      campusEventsNotifications: z.boolean().optional(),
      marketplaceNotifications: z.boolean().optional(),
      academicNotifications: z.boolean().optional(),
      followRequestNotifications: z.boolean().optional(),
    })
    .refine(
      (data) => Object.keys(data).length > 0,
      { message: "At least one notification preference must be provided" }
    ),
});

// Appearance Preferences

export const updateAppearancePreferencesSchema = z.object({
  body: z
    .object({
      theme: z.enum(["light", "dark"]).optional(),
      textSize: z
        .enum(["small", "medium", "large", "extra-large"])
        .optional(),
    })
    .refine(
      (data) => Object.keys(data).length > 0,
      { message: "At least one appearance preference must be provided" }
    ),
});

// Privacy Preferences

export const updatePrivacyPreferencesSchema = z.object({
  body: z
    .object({
      accountVisibility: z.enum(["everyone", "friends"]).optional(),
      whoCanMessage: z.enum(["everyone", "friends", "nobody"]).optional(),
      allowTagging: z.boolean().optional(),
    })
    .refine(
      (data) => Object.keys(data).length > 0,
      { message: "At least one privacy preference must be provided" }
    ),
});

// Bug Report

export const submitBugReportSchema = z.object({
  body: z.object({
    title: z.string().min(1, "Title is required").max(200),
    category: z.string().min(1, "Category is required"),
    severity: z.string().min(1, "Severity is required"),
    description: z.string().min(1, "Description is required").max(2000),
    steps: z.string().optional(),
    browser: z.string().optional(),
    attachments: z.array(z.string()).optional(),
  }),
});