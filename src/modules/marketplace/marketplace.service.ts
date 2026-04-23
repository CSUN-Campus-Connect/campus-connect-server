/**
 * ============================================================================
 * MARKETPLACE SERVICE LAYER
 * ============================================================================
 * 
 * This file contains all business logic for marketplace operations
 * Handles database interactions through Prisma ORM
 * 
 * Responsibilities:
 * - CRUD operations for marketplace listings
 * - Complex queries with filters and sorting
 * - View count tracking
 * - Favorite management
 * - Data transformation from Prisma models to API responses
 * 
 * Pattern: Service layer separates business logic from route handlers
 * This makes code more testable and maintainable
 */

import prisma from "../../utils/prisma";
import {
  CreateListingData,
  UpdateListingData,
  PublicListing,
  ListingQueryOptions,
} from "./marketplace.types";
import { ListingStatus } from "@prisma/client";

/**
 * Get All Listings with Filters and Sorting
 * 
 * This function handles complex queries including:
 * - Category filtering
 * - Price range filtering  
 * - Search across title and description
 * - Sorting by various criteria
 * - Pagination
 * 
 * @param options - Query options including filters, sorting, and pagination
 * @returns Array of public listing objects
 */
export const getAllListings = async (
  options: ListingQueryOptions = {}
): Promise<PublicListing[]> => {
  const {
    category,
    condition,
    listingType,
    minPrice,
    maxPrice,
    search,
    sellerId,
    status = ListingStatus.active, // Default to active listings only
    sortBy = 'recent',
    limit,
    offset,
  } = options;

  // Build the where clause for filtering
  const where: any = {
    status, // Only show listings with specified status
  };

  // Add category filter if provided
  if (category) {
    where.category = category;
  }

  // Add condition filter if provided
  if (condition) {
    where.condition = condition;
  }

  // Add listing type filter if provided
  if (listingType) {
    where.listingType = listingType;
  }

  // Add seller filter if provided
  if (sellerId) {
    where.sellerId = sellerId;
  }

  // Add price range filter if provided
  if (minPrice !== undefined || maxPrice !== undefined) {
    where.price = {};
    if (minPrice !== undefined) {
      where.price.gte = minPrice; // Greater than or equal
    }
    if (maxPrice !== undefined) {
      where.price.lte = maxPrice; // Less than or equal
    }
  }

  // Add search filter if provided
  // Searches in both title and description (case-insensitive)
  if (search) {
    where.OR = [
      { title: { contains: search, mode: 'insensitive' } },
      { description: { contains: search, mode: 'insensitive' } },
    ];
  }

  // Determine sort order based on sortBy parameter
  let orderBy: any;
  switch (sortBy) {
    case 'price-low':
      orderBy = { price: 'asc' }; // Ascending price (lowest first)
      break;
    case 'price-high':
      orderBy = { price: 'desc' }; // Descending price (highest first)
      break;
    case 'popular':
      orderBy = { views: 'desc' }; // Most viewed first
      break;
    case 'recent':
    default:
      orderBy = { createdAt: 'desc' }; // Newest first (default)
      break;
  }

  // Execute the query with all filters and options
  const listings = await prisma.marketplaceListing.findMany({
    where,
    orderBy,
    take: limit, // Limit number of results (for pagination)
    skip: offset, // Skip results (for pagination)
    include: {
      seller: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          profilePicture: true,
        },
      },
      _count: {
        select: {
          favoritedBy: true, // Count how many users favorited this
        },
      },
    },
  });

  return listings as PublicListing[];
};

/**
 * Get Single Listing by ID
 * 
 * Fetches a specific listing with full details
 * Includes seller information
 * 
 * @param id - Listing ID
 * @returns Public listing object or null if not found
 */
export const getListingById = async (
  id: string
): Promise<PublicListing | null> => {
  const listing = await prisma.marketplaceListing.findUnique({
    where: { id },
    include: {
      seller: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          profilePicture: true,
        },
      },
      _count: {
        select: {
          favoritedBy: true,
        },
      },
    },
  });

  return listing as PublicListing | null;
};

/**
 * Create New Listing
 * 
 * Creates a new marketplace listing in the database
 * All required fields must be provided
 * 
 * @param data - Listing creation data
 * @returns Newly created public listing object
 */
export const createListing = async (
  data: CreateListingData
): Promise<PublicListing> => {
  const newListing = await prisma.marketplaceListing.create({
    data: {
      title: data.title,
      description: data.description,
      price: data.price,
      originalPrice: data.originalPrice,
      images: data.images,
      condition: data.condition,
      category: data.category,
      location: data.location,
      listingType: data.listingType,
      meetupLocation: data.meetupLocation ?? null,
      rentalPrice: data.rentalPrice ?? null,
      rentalDurationDays: data.rentalDurationDays ?? null,
      sellerId: data.sellerId,
    },
    include: {
      seller: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          profilePicture: true,
        },
      },
      _count: {
        select: {
          favoritedBy: true,
        },
      },
    },
  });

  return newListing as PublicListing;
};

/**
 * Update Existing Listing
 * 
 * Updates a listing with new data
 * Only updates fields that are provided (partial update)
 * Verifies that the listing exists before updating
 * 
 * @param id - Listing ID to update
 * @param data - Fields to update
 * @returns Updated public listing object or null if not found
 */
export const updateListing = async (
  id: string,
  data: UpdateListingData
): Promise<PublicListing | null> => {
  // Check if listing exists
  const existing = await prisma.marketplaceListing.findUnique({
    where: { id },
  });

  if (!existing) {
    return null;
  }

  // Update the listing
  const updated = await prisma.marketplaceListing.update({
    where: { id },
    data,
    include: {
      seller: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          profilePicture: true,
        },
      },
      _count: {
        select: {
          favoritedBy: true,
        },
      },
    },
  });

  return updated as PublicListing;
};

/**
 * Delete Listing (Soft Delete)
 * 
 * Marks a listing as deleted rather than removing from database
 * This preserves data for analytics and prevents broken references
 * 
 * @param id - Listing ID to delete
 * @returns True if deleted successfully, false if not found
 */
export const deleteListing = async (id: string): Promise<boolean> => {
  try {
    await prisma.marketplaceListing.update({
      where: { id },
      data: { status: ListingStatus.deleted },
    });
    return true;
  } catch (error) {
    return false;
  }
};

/**
 * Increment View Count
 * 
 * Increases the view counter for a listing
 * Called when someone opens the listing detail page
 * Used for popularity tracking and sorting
 * 
 * @param id - Listing ID
 * @returns Updated listing or null if not found
 */
export const incrementViews = async (
  id: string
): Promise<PublicListing | null> => {
  try {
    const updated = await prisma.marketplaceListing.update({
      where: { id },
      data: {
        views: {
          increment: 1, // Atomic increment operation
        },
      },
      include: {
        seller: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            profilePicture: true,
          },
        },
        _count: {
          select: {
            favoritedBy: true,
          },
        },
      },
    });
    return updated as PublicListing;
  } catch (error) {
    return null;
  }
};

/**
 * Toggle Favorite Status
 * 
 * Adds or removes a listing from user's favorites
 * If already favorited, removes it; if not favorited, adds it
 * 
 * @param userId - User ID who is favoriting
 * @param listingId - Listing ID to favorite/unfavorite
 * @returns True if now favorited, false if unfavorited
 */
export const toggleFavorite = async (
  userId: string,
  listingId: string
): Promise<boolean> => {
  // Check if already favorited
  const existing = await prisma.marketplaceFavorite.findUnique({
    where: {
      userId_listingId: {
        userId,
        listingId,
      },
    },
  });

  if (existing) {
    // Already favorited - remove it
    await prisma.marketplaceFavorite.delete({
      where: {
        userId_listingId: {
          userId,
          listingId,
        },
      },
    });
    return false; // Now unfavorited
  } else {
    // Not favorited - add it
    await prisma.marketplaceFavorite.create({
      data: {
        userId,
        listingId,
      },
    });
    return true; // Now favorited
  }
};

/**
 * Get User's Favorite Listings
 * 
 * Retrieves all listings that a user has favorited
 * Useful for displaying a user's wishlist
 * 
 * @param userId - User ID
 * @returns Array of public listing objects
 */
export const getUserFavorites = async (
  userId: string
): Promise<PublicListing[]> => {
  const favorites = await prisma.marketplaceFavorite.findMany({
    where: { userId },
    include: {
      listing: {
        include: {
          seller: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              profilePicture: true,
            },
          },
          _count: {
            select: {
              favoritedBy: true,
            },
          },
        },
      },
    },
  });

  return favorites.map((fav) => fav.listing) as PublicListing[];
};
