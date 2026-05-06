/**
 * ============================================================================
 * MARKETPLACE TYPE DEFINITIONS
 * ============================================================================
 * 
 * This file defines all TypeScript types and interfaces for the marketplace module
 * Ensures type safety across the entire marketplace feature
 * 
 * Types are separated from Prisma models to allow for:
 * - API-specific data transformations
 * - Validation schemas
 * - Frontend/backend data contracts
 */

import { MarketplaceCategory, ItemCondition, ListingStatus, ListingType } from "@prisma/client";

/**
 * CreateListingData
 * Data required to create a new marketplace listing
 * Used in POST /marketplace endpoint
 */
export interface CreateListingData {
  title: string;                    // Item title (required)
  description: string;               // Detailed description (required)
  price: number | null;              // Current selling price (required for sale)
  originalPrice?: number;            // Original price for showing savings (optional)
  images: string[];                  // Array of image URLs (required, can be empty)
  condition: ItemCondition;          // Item condition enum (required)
  category: MarketplaceCategory;     // Category enum (required)
  location: string;                  // Campus location (required)
  listingType: ListingType;
  meetupLocation?: string | null;
  rentalPrice?: number | null;
  rentalDurationDays?: number | null;
  sellerId: string;                  // User ID of seller (required)
}

/**
 * UpdateListingData
 * Data that can be updated on an existing listing
 * Used in PUT /marketplace/:id endpoint
 * All fields are optional to allow partial updates
 */
export interface UpdateListingData {
  title?: string;
  description?: string;
  price?: number | null;
  originalPrice?: number;
  images?: string[];
  condition?: ItemCondition;
  category?: MarketplaceCategory;
  location?: string;
  listingType?: ListingType;
  meetupLocation?: string | null;
  rentalPrice?: number | null;
  rentalDurationDays?: number | null;
  status?: ListingStatus;            // Allows marking as sold/inactive
}

/**
 * PublicListing
 * Listing data returned to clients
 * Includes seller information for display
 * Excludes sensitive data
 */
export interface PublicListing {
  id: string;
  title: string;
  description: string;
  price: number | null;
  originalPrice: number | null;
  images: string[];
  condition: ItemCondition;
  category: MarketplaceCategory;
  location: string;
  listingType: ListingType;
  meetupLocation: string | null;
  rentalPrice: number | null;
  rentalDurationDays: number | null;
  views: number;
  status: ListingStatus;
  createdAt: Date;
  updatedAt: Date;
  
  // Seller information
  seller: {
    id: string;
    firstName: string;
    lastName: string;
    profilePicture: string | null;
  };
  
  // Favorites count
  _count?: {
    favoritedBy: number;
  };
}

/**
 * ListingFilters
 * Query parameters for filtering listings
 * Used in GET /marketplace endpoint
 */
export interface ListingFilters {
  category?: MarketplaceCategory;    // Filter by category
  condition?: ItemCondition;         // Filter by condition
  listingType?: ListingType;
  minPrice?: number;                 // Minimum price
  maxPrice?: number;                 // Maximum price
  search?: string;                   // Search in title/description
  sellerId?: string;                 // Filter by seller
  status?: ListingStatus;            // Filter by status (default: active only)
}

/**
 * ListingSortOptions
 * Sorting options for listing queries
 */
export type ListingSortBy = 'recent' | 'price-low' | 'price-high' | 'popular';

export interface ListingQueryOptions extends ListingFilters {
  sortBy?: ListingSortBy;
  limit?: number;                    // Number of results to return
  offset?: number;                   // Pagination offset
}
