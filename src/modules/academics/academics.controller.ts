// Empty handlers for academics/degree-planner endpoints. 


import { Request, Response, NextFunction } from "express";

export const getPlannerHandler = async (
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    res.status(200).json({ semesters: [], selectedSemesterId: null });
  } catch (error) {
    next(error);
  }
};

export const savePlannerHandler = async (
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    res.status(200).json({ ok: true });
  } catch (error) {
    next(error);
  }
};

export const listMajorsHandler = async (
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
