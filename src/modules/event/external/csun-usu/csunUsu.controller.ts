import { Request, Response } from "express";
import dayjs from "dayjs";
import { csunUsuQuerySchema } from "./csunUsu.validation";
import { fetchCsunUsuEvents } from "./csunUsu.service";

const ICS_URL = process.env.CSUN_USU_ICS_URL;

export const listCsunUsuEvents = async (req: Request, res: Response) => {
  if (!ICS_URL) return res.status(500).json({ error: "CSUN_USU_ICS_URL is not set" });

  const parsed = csunUsuQuerySchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: "Invalid query params" });

  const daysAhead = parsed.data.daysAhead ?? 14;
  const now = dayjs();
  const end = now.add(daysAhead, "day");

  try {
    const events = await fetchCsunUsuEvents(ICS_URL);

    const filtered = events
      .filter((e) => dayjs(e.start).isAfter(now.subtract(1, "day")))
      .filter((e) => dayjs(e.start).isBefore(end));

    return res.json(filtered);
  } catch (err: any) {
    return res.status(502).json({ error: err?.message || "Failed to load events" });
  }
};
