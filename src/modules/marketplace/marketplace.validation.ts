/**
 * ============================================================================
 * MARKETPLACE VALIDATION SCHEMAS
 * ============================================================================
 * 
 * This file defines validation schemas using Zod library
 * Ensures all incoming data meets requirements before processing
 * 
 * Benefits of validation:
 * - Prevents invalid data from entering the database
 * - Provides clear error messages to frontend
 * - Type-safe validation with TypeScript integration
 * - Catches errors early in the request cycle
 */

import { z } from "zod";

/**
 * Enum Validation Schemas
 * These match the Prisma enums defined in schema.prisma
 */
const categorySchema = z.enum([
  "textbooks",
  "electronics",
  "furniture",
  "clothing",
  "accessories",
  "other",
]);

const conditionSchema = z.enum([
  "likeNew",
  "excellent",
  "good",
  "fair",
  "poor",
]);

const statusSchema = z.enum([
  "active",
  "sold",
  "inactive",
  "deleted",
]);

/**
 * Create Listing Validation Schema
 * 
 * Validates POST /marketplace requests
 * All fields are required except originalPrice and images
 * 
 * Constraints:
 * - Title: 3-100 characters
 * - Description: 10-2000 characters
 * - Price: Positive number, max 2 decimal places
 * - Images: Array of valid URLs
 * - Location: 3-200 characters
 */
export const createListingSchema = z.object({
  body: z.object({
    title: z
      .string({ message: "Title is required" })
      .min(3, { message: "Title must be at least 3 characters" })
      .max(100, { message: "Title must not exceed 100 characters" })
      .trim(),

    description: z
      .string({ message: "Description is required" })
      .min(10, { message: "Description must be at least 10 characters" })
      .max(2000, { message: "Description must not exceed 2000 characters" })
      .trim(),

    price: z
      .number({ message: "Price is required" })
      .positive({ message: "Price must be positive" })
      .finite({ message: "Price must be a finite number" })
      .refine(
        (val) => Number.isFinite(val) && Math.abs(val * 100 - Math.round(val * 100)) < Number.EPSILON,
        { message: "Price can have at most 2 decimal places" }
      ),

    originalPrice: z
      .number()
      .positive({ message: "Original price must be positive" })
      .finite()
      .optional()
      .nullable(),

    images: z
      .array(
        z.string().refine(
          (s) => {
            if (s.startsWith('data:image/')) return true;
            try { new URL(s); return true; } catch { return false; }
          },
          { message: 'Each image must be a valid URL or base64 data URL' }
        )
      )
      .default([])
      .refine((arr) => arr.length <= 8, {
        message: "Maximum 8 images allowed",
      }),

    condition: conditionSchema,

    category: categorySchema,

    location: z
      .string({ message: "Location is required" })
      .min(3, { message: "Location must be at least 3 characters" })
      .max(200, { message: "Location must not exceed 200 characters" })
      .trim(),
  }),
});

/**
 * Update Listing Validation Schema
 * 
 * Validates PUT /marketplace/:id requests
 * All fields are optional to allow partial updates
 * Same constraints as create schema where applicable
 */
export const updateListingSchema = z.object({
  body: z.object({
    title: z
      .string()
      .min(3, { message: "Title must be at least 3 characters" })
      .max(100, { message: "Title must not exceed 100 characters" })
      .trim()
      .optional(),

    description: z
      .string()
      .min(10, { message: "Description must be at least 10 characters" })
      .max(2000, { message: "Description must not exceed 2000 characters" })
      .trim()
      .optional(),

    price: z
      .number()
      .positive({ message: "Price must be positive" })
      .finite()
      .optional(),

    originalPrice: z
      .number()
      .positive({ message: "Original price must be positive" })
      .finite()
      .optional()
      .nullable(),

    images: z
      .array(
        z.string().refine(
          (s) => {
            if (s.startsWith('data:image/')) return true;
            try { new URL(s); return true; } catch { return false; }
          },
          { message: 'Each image must be a valid URL or base64 data URL' }
        )
      )
      .refine((arr) => arr.length <= 8, {
        message: "Maximum 8 images allowed",
      })
      .optional(),

    condition: conditionSchema.optional(),

    category: categorySchema.optional(),

    location: z
      .string()
      .min(3, { message: "Location must be at least 3 characters" })
      .max(200, { message: "Location must not exceed 200 characters" })
      .trim()
      .optional(),

    status: statusSchema.optional(),
  }),
});

/**
 * Get Listings Query Parameters Schema
 * 
 * Validates GET /marketplace query parameters
 * All parameters are optional for flexible filtering
 */
export const getListingsSchema = z.object({
  query: z.object({
    category: categorySchema.optional(),
    condition: conditionSchema.optional(),
    minPrice: z.coerce.number().positive().optional(),
    maxPrice: z.coerce.number().positive().optional(),
    search: z.string().trim().optional(),
    sellerId: z.string().uuid().optional(),
    status: statusSchema.optional(),
    sortBy: z.enum(['recent', 'price-low', 'price-high', 'popular']).optional(),
    limit: z.coerce.number().int().positive().max(100).optional(),
    offset: z.coerce.number().int().nonnegative().optional(),
  }),
});

/**
 * Listing ID Parameter Schema
 * 
 * Validates :id route parameters
 * Ensures ID is a valid CUID (Prisma's default ID format)
 */
export const listingIdSchema = z.object({
  params: z.object({
    id: z.string({ message: "Listing ID is required" }),
  }),
});
