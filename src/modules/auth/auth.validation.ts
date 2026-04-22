import { z } from "zod";

// CSUN validator
const csunEmail = z
  .string()
  .email({ message: "Invalid email address" })
  .refine((email) => email.toLowerCase().endsWith("@my.csun.edu"), {
    message: "Only @my.csun.edu email addresses are allowed",
});

export const registerSchema = z.object({
  body: z.object({
    email: csunEmail, // Use custom CSUN email validator
    password: z
      .string()
      .min(8, { message: "Password must be at least 8 characters" }),
    firstName: z
      .string()
      .min(2, { message: "First name must be at least 2 characters" })
      .max(20, { message: "First name must not exceed 20 characters" }),
    lastName: z
      .string()
      .min(2, { message: "Last name must be at least 2 characters" })
      .max(20, { message: "Last name must not exceed 20 characters" }),
      phoneNumber: z
      .string()
      .optional(),
  }),
});

export const loginSchema = z.object({
  body: z.object({
    email: csunEmail, // refrences back to CSUN email validort
    password: z.string().min(1, { message: "Password is required" }),
  }),
});

// Profile upsert validator
export const upsertProfileSchema = z.object({
  body: z.object({
    firstName: z
      .string()
      .min(2, { message: "First name must be at least 2 characters" })
      .max(20, { message: "First name must not exceed 20 characters" })
      .optional(),

    lastName: z
    .string()
    .min(2, { message: "Last name must be at least 2 characters" })
    .max(20, { message: "Last name must not exceed 20 characters" })
    .optional(),

    profilePicture: z
    .string()
    .optional(),

    bio: z
    .string()
    .max(250, { message: "Bio must not exceed 250 characters" })
    .optional(),

    city: z
    .string()
    .max(50, { message: "City must not exceed 50 characters" })
    .optional(),

    websites: z
    .array(z.string().url({ message: "Invalid URL format" }))
    .max(5, { message: "You can add up to 5 websites" })
    .optional(),
  }),
});