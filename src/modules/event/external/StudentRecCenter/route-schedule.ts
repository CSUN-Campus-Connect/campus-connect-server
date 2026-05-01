// src/app/api/src-schedule/route.ts
//
// FIX (2026-05-01):
//  - revalidate: 0  →  always asks backend (backend has its own 1-hour cache)
//    This ensures the schedule is never stale across week boundaries.
//  - Expanded CATEGORY_MAP to cover more SRCClassCategory values
//  - Added imageUrl passthrough so WeeklySchedule dialog can show event images

import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:8000";

/**
 * Maps SRCClassCategory (backend) → WeeklyClass["category"] (frontend).
 * WeeklyClass accepts: "cardio" | "strength" | "mind-body" | "aquatics" | "dance" | "hiit"
 */
const CATEGORY_MAP: Record<string, string> = {
  "Aquatics":             "aquatics",
  "Group Exercise":       "cardio",
  "Boxing":               "hiit",
  "Intramural":           "cardio",
  "Outdoor Adventures":   "cardio",
  "Special Event":        "cardio",
  "Other":                "cardio",
};

const DAY_INDEX: Record<string, number> = {
  Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3,
  Thursday: 4, Friday: 5, Saturday: 6,
};

export async function GET(req: NextRequest) {
  try {
    const week = req.nextUrl.searchParams.get("week") ?? "";
    const day  = req.nextUrl.searchParams.get("day")  ?? "";

    const params = new URLSearchParams();
    if (week) params.set("week", week);
    if (day)  params.set("day",  day);

    const url = `${BACKEND_URL}/api/v1/src/schedule${
      params.toString() ? `?${params}` : ""
    }`;

    const res = await fetch(url, {
      cache: "no-store",
      next: { revalidate: 0 },
    });

    if (!res.ok) {
      console.error("[src-schedule] Backend returned", res.status);
      return NextResponse.json([], { status: res.status });
    }

    const json = await res.json();

    // Map SRCScheduleClass (backend) → WeeklyClass (WeeklySchedule.tsx)
    const classes = (json.data ?? []).map((c: any) => ({
      id:         c.id,
      name:       c.title,
      instructor: c.instructor ?? "",
      location:   c.location   ?? "",
      dayOfWeek:  DAY_INDEX[c.day] ?? 0,
      startTime:  c.startTime,   // "HH:mm" 24-hour
      endTime:    c.endTime,     // "HH:mm" 24-hour
      category:   CATEGORY_MAP[c.category] ?? "cardio",
      spots:      c.spots      ?? undefined,
      spotsLeft:  c.spots      ?? undefined,
      // Extra fields for the detail dialog (not in WeeklyClass type but harmless)
      imageUrl:   c.imageUrl   ?? null,
      description: c.description ?? "",
      registrationUrl: c.registrationUrl ?? "",
    }));

    return NextResponse.json(classes);
  } catch (err) {
    console.error("[src-schedule] error:", err);
    return NextResponse.json([], { status: 500 });
  }
}
