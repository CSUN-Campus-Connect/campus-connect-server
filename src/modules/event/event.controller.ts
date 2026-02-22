import { Request, Response, NextFunction } from "express";
import * as eventService from "./event.service";

export const createEventHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user?.id) {
      res.status(401).json({ message: "Authentication error" });
      return;
    }

    // Validate end date is after start date
    const startDate = new Date(req.body.startDate);
    const endDate = new Date(req.body.endDate);
    
    if (endDate <= startDate) {
      res.status(400).json({ 
        error: "Validation failed",
        details: [{
          path: "body.endDate",
          message: "End date must be after start date"
        }]
      });
      return;
    }

    const eventData = {
      title: req.body.title,
      description: req.body.description,
      startDate: req.body.startDate,
      endDate: req.body.endDate,
      location: req.body.location,
      banner: req.body.banner,
      createdById: req.user.id,
    };

    const newEvent = await eventService.createEvent(eventData);

    res.status(201).json(newEvent);
  } catch (error) {
    next(error);
  }
};
