import { Request, Response, NextFunction } from "express";
import * as eventService from "./event.service";
import logger from "@/utils/logger";

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

    res.status(201).json({
      message: "Event created successfully",
      event: newEvent,
    });
  } catch (error) {
    logger.error(error, "event.create.failed");
    next(error);
  }
};

export const getEventsByDateRangeHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const rangeStart = new Date(req.query.rangeStart as string);
    const rangeEnd = new Date(req.query.rangeEnd as string);

    if (isNaN(rangeStart.getTime()) || isNaN(rangeEnd.getTime())) {
      res.status(400).json({ 
        error: "Validation failed",
        details: [{
          path: "query.rangeStart",
          message: "Invalid date format"
        }]
      });
      return;
    }

    if (rangeEnd <= rangeStart) {
      res.status(400).json({ 
        error: "Validation failed",
        details: [{
          path: "query.rangeEnd",
          message: "End date must be after start date"
        }]
      });
      return;
    }

    const events = await eventService.getEventsByDateRange(rangeStart, rangeEnd);

    if (!events) {
      res.status(404).json({ message: "No events found with range: " + rangeStart + " to " + rangeEnd });
      return;
    }
    
    res.status(200).json(events);
  } catch (error) {
    logger.error(error, "event.get_by_date_range.failed");
    next(error);
  }
};

export const getEventByIdHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const event = await eventService.getEventById(req.params.id as string);
    
    if (!event) {
      res.status(404).json({ message: "Event not found" });
      return;
    }

    res.status(200).json(event);
  } catch (error) {
    logger.error(error, "event.get_by_id.failed");
    next(error);
  }
};

export const updateEventHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user?.id) {
      res.status(401).json({ message: "Authentication error" });
      return;
    }

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

    const updatedEvent = await eventService.updateEvent(req.params.id as string, eventData);

    if (!updatedEvent) {
      res.status(404).json({ message: "Event not found" });
      return;
    }

    res.status(200).json({
      message: "Event updated successfully",
      event: updatedEvent,
    });
    logger.info(updatedEvent, "event.update.success");
  } catch (error) {
    logger.error(error, "event.update.failed");
    next(error);
  }
};

export const deleteEventHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user?.id) {
      res.status(401).json({ message: "Authentication error" });
      return;
    }

    const deletedEvent = await eventService.deleteEvent(req.params.id as string, req.user.id);

    if (!deletedEvent) {
      res.status(404).json({ message: "Event not found" });
      return;
    }

    res.status(200).json({
      message: "Event deleted successfully",
      event: deletedEvent,
    });
    logger.info(deletedEvent, "event.delete.success");
  } catch (error) {
    logger.error(error, "event.delete.failed");
    next(error);
  }
}