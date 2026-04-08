import { z } from "zod";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { UserType } from "@prisma/client";

extendZodWithOpenApi(z);

// CSUN validator
const csunEmail = z
  .email({ message: "Invalid email address" })
  .refine((email) => email.toLowerCase().endsWith("@my.csun.edu"), {
    message: "Only @my.csun.edu email addresses are allowed",
  })
  .meta({
    id: "CSUN Email",
    description: "A valid CSUN email address",
    example: "john.doe@my.csun.edu",
  });

export const PublicUserSchema = z.object({
  id: z.uuid().meta({
    id: "User ID",
    description: "Unique identifier for the user",
  }),
  email: csunEmail,
  firstName: z.string().meta({
    id: "First Name",
    description: "User's first name",
    example: "John",
  }),
  lastName: z.string().meta({
    id: "Last Name",
    description: "User's last name",
    example: "Doe",
  }),
  isVerified: z.boolean().meta({
    id: "Verification Status",
    description: "Indicates if the user's email is verified",
    example: true,
  }),
  profilePicture: z.url().nullable().meta({
    id: "Profile Picture",
    description: "URL to the user's profile picture",
  }),
  bio: z.string().max(500).nullable().meta({
    id: "Bio",
    description: "Short biography of the user",
    example: "Computer Science student at CSUN.",
  }),
  userType: z.enum(UserType).meta({
    id: "User Type",
    description: "Type of user",
    example: UserType.student,
  }),
  city: z.string().max(100).nullable().meta({
    id: "City",
    description: "City where the user is located",
    example: "Northridge",
  }),
  websites: z
    .array(z.url())
    .nullable()
    .meta({
      id: "Websites",
      description: "List of user's personal or professional websites",
      example: ["https://johndoe.com", "https://johndoe.dev"],
    }),
  createdAt: z.date().meta({
    id: "Created At",
    description: "Timestamp when the user was created",
  }),
});
export type PublicUser = z.infer<typeof PublicUserSchema>;

export const RegisterSchema = z.object({
  body: z.object({
    email: csunEmail, // Use custom CSUN email validator
    password: z
      .string()
      .min(8, { message: "Password must be at least 8 characters" })
      .meta({
        id: "Register Password",
        description: "Password must be at least 8 characters long",
      }),
    firstName: z
      .string()
      .min(2, { message: "First name must be at least 2 characters" })
      .max(20, { message: "First name must not exceed 20 characters" })
      .meta({
        id: "Register First Name",
        description: "First name must be at least 2 characters long",
        example: "John",
      }),
    lastName: z
      .string()
      .min(2, { message: "Last name must be at least 2 characters" })
      .max(20, { message: "Last name must not exceed 20 characters" })
      .meta({
        id: "Register Last Name",
        description: "Last name must be at least 2 characters long",
        example: "Doe",
      }),
  }),
});

export const RegisterSuccessSchema = z.object({
  message: z.string().meta({
    id: "Register Success Message",
    description: "Message indicating successful registration",
    example: "User registered successfully",
  }),
  user: PublicUserSchema,
});

export const LoginSchema = z.object({
  body: z.object({
    email: csunEmail,
    password: z.string().min(1, { message: "Password is required" }).meta({
      id: "Login Password",
      description: "Registered account password",
    }),
  }),
});

export const LoginSuccessSchema = z.object({
  message: z.string().meta({
    id: "Login Success Message",
    description: "Message indicating successful login",
    example: "Login successful",
  }),
  accessToken: z.jwt().meta({
    id: "Access Token",
    description: "JWT for authentication",
  }),
  refreshToken: z.jwt().meta({
    id: "Refresh Token",
    description: "JWT for token refresh",
  }),
  user: PublicUserSchema,
});

export const RefreshTokenSchema = z.object({
  message: z.string().meta({
    id: "Refresh Token Success Message",
    description: "Message indicating successful token refresh",
    example: "Access token refreshed successfully",
  }),
  accessToken: z.jwt().meta({
    id: "New Access Token",
    description: "Newly issued JWT for authentication",
  }),
});

export const CurrentUserSchema = z.object({
  user: PublicUserSchema,
});

// Profile upsert validator
export const UpsertProfileSchema = z.object({
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

    profilePicture: z.string().optional(),

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

export const UpsertProfileSuccessSchema = z.object({
  message: z.string().meta({
    id: "Upsert Profile Success Message",
    description: "Message indicating successful profile upsert",
    example: "Profile upserted successfully",
  }),
  data: PublicUserSchema,
});

export const DeleteUserSuccessSchema = z.object({
  message: z.string().meta({
    id: "Delete User Success Message",
    description: "Message indicating successful user deletion",
    example: "Account deleted successfully",
  }),
});
