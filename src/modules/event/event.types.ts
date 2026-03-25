import { z } from "zod";
import { publicEventSchema } from "./event.schemas";

export interface EventData {
  title: string;
  description?: string;
  startDate: string;
  endDate: string;
  location?: string;
  banner?: string;
  createdById: string;
}

export type PublicEvent = z.infer<typeof publicEventSchema>;