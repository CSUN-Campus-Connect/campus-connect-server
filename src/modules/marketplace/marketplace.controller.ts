/**
 * ============================================================================
 * MARKETPLACE CONTROLLER
 * ============================================================================
 * 
 * Request handlers for marketplace endpoints
 * Handles HTTP requests and responses
 * Delegates business logic to service layer
 */

import { Request, Response, NextFunction } from "express";
import * as marketplaceService from "./marketplace.service";
import { CreateListingData, UpdateListingData } from "./marketplace.types";

// Get all listings with optional filters
export const getAllListingsHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const listings = await marketplaceService.getAllListings(req.query as any);
    res.status(200).json(listings);
  } catch (error) {
    next(error);
  }
};

// Get single listing by ID
export const getListingByIdHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const listing = await marketplaceService.getListingById(req.params.id as string);
    if (!listing || listing.status === 'deleted') {
      res.status(404).json({ message: "Listing not found" });
      return;
    }
    res.status(200).json(listing);
  } catch (error) {
    next(error);
  }
};

// Create new listing
export const createListingHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user?.id) {
      res.status(401).json({ message: "Authentication required" });
      return;
    }

    const listingData: CreateListingData = {
      ...req.body,
      sellerId: req.user.id,
    };

    const newListing = await marketplaceService.createListing(listingData);
    res.status(201).json(newListing);
  } catch (error) {
    next(error);
  }
};

// Update listing
export const updateListingHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user?.id) {
      res.status(401).json({ message: "Authentication required" });
      return;
    }

    // Verify user owns the listing
    const listing = await marketplaceService.getListingById(req.params.id as string);
    if (!listing) {
      res.status(404).json({ message: "Listing not found" });
      return;
    }

    if (listing.seller.id !== req.user.id) {
      res.status(403).json({ message: "Not authorized to update this listing" });
      return;
    }

    const updateData: UpdateListingData = req.body;
    const updated = await marketplaceService.updateListing(req.params.id as string, updateData);
    res.status(200).json(updated);
  } catch (error) {
    next(error);
  }
};

// Delete listing
export const deleteListingHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user?.id) {
      res.status(401).json({ message: "Authentication required" });
      return;
    }

    const listing = await marketplaceService.getListingById(req.params.id as string);
    if (!listing) {
      res.status(404).json({ message: "Listing not found" });
      return;
    }

    if (listing.seller.id !== req.user.id) {
      res.status(403).json({ message: "Not authorized to delete this listing" });
      return;
    }

    await marketplaceService.deleteListing(req.params.id as string);
    res.status(200).json({ message: "Listing deleted successfully" });
  } catch (error) {
    next(error);
  }
};

// Increment view count
export const incrementViewsHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const listing = await marketplaceService.incrementViews(req.params.id as string);
    if (!listing) {
      res.status(404).json({ message: "Listing not found" });
      return;
    }
    res.status(200).json(listing);
  } catch (error) {
    next(error);
  }
};

// Toggle favorite
export const toggleFavoriteHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user?.id) {
      res.status(401).json({ message: "Authentication required" });
      return;
    }

    const isFavorited = await marketplaceService.toggleFavorite(
      req.user.id,
      req.params.id as string
    );
    res.status(200).json({ favorited: isFavorited });
  } catch (error) {
    next(error);
  }
};

// Get user's favorites
export const getUserFavoritesHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user?.id) {
      res.status(401).json({ message: "Authentication required" });
      return;
    }

    const favorites = await marketplaceService.getUserFavorites(req.user.id);
    res.status(200).json(favorites);
  } catch (error) {
    next(error);
  }
};
