import { z } from "zod";

// CSUN email validator
const csunEmail = z
  .string()
  .email({ message: "Invalid email address" })
  .refine((email) => email.toLowerCase().endsWith("@my.csun.edu"), {
    message: "Only @my.csun.edu email addresses are allowed",
  });

// Strong password validator
export const strongPassword = z
  .string()
  .min(8, { message: "Password must be at least 8 characters" })
  .max(100, { message: "Password must not exceed 100 characters" })
  .regex(/[a-z]/, { message: "Password must contain at least one lowercase letter" })
  .regex(/[A-Z]/, { message: "Password must contain at least one uppercase letter" })
  .regex(/[0-9]/, { message: "Password must contain at least one number" })
  .regex(/[^a-zA-Z0-9]/, { message: "Password must contain at least one special character" });

// Request password reset validation
export const requestPasswordResetSchema = z.object({
  body: z.object({
    email: csunEmail,
  }),
});

// Reset password validation
export const resetPasswordSchema = z.object({
  body: z.object({
    token: z
      .string()
      .min(1, { message: "Token is required" })
      .length(64, { message: "Invalid token format" }),
    password: strongPassword,
  }),
});

// Type exports
export type RequestPasswordResetInput = z.infer<typeof requestPasswordResetSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;