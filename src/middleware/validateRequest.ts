/**
 * Middleware to validate request data using Zod schemas.
 * Validates request body, query parameters, and URL parameters.
 * If validation fails, responds with a 400 status and error details.
 * If validation succeeds, proceeds to the next middleware or route handler.
 */
import { Request, Response, NextFunction } from "express";
import { ZodObject, ZodError } from "zod";

// Middleware to validate request data, returns function (higher order function)
export const validate =
  (schema: ZodObject<any>) =>
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      await schema.parseAsync({
        body: req.body,
        query: req.query,
        params: req.params,
      });
      next();
      return;
    } catch (error) {
      if (error instanceof ZodError) {
        // Format errors properly
        const formattedErrors = (error.issues ?? []).map((err) => ({
          path: err.path.join("."),
          message: err.message,
        }));
        
        res.status(400).json({
          error: "Validation failed",
          details: formattedErrors,
        });
        return;
      }

      res.status(500).json({ message: "Internal server error" });
      return;
    }
  };