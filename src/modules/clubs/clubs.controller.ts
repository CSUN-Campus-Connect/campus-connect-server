// Empty handlers for clubs endpoints. 

import { Request, Response, NextFunction } from "express";

export const listClubsHandler = async (
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    res.status(200).json([]);
  } catch (error) {
    next(error);
  }
};

export const getClubBySlugHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { slug } = req.params;
    
    res.status(404).json({ error: "Club not found", slug });
  } catch (error) {
    next(error);
  }
};

export const recommendClubHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const body = req.body || {};
    const { interest } = body;
    
    const slug = interest && typeof interest === "string" ? interest.toLowerCase().slice(0, 20) : "acm";
    res.status(200).json({ slug, name: null });
  } catch (error) {
    next(error);
  }
};
