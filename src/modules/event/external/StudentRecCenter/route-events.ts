// src/app/api/src-events/route.ts
//
// FIX (2026-05-01):
//  - Maps SRCEvent.imageUrl through to CalEvent.imageUrl so EventsBanner
//    can render scraped event images
//  - No other changes needed: the service now returns past-30-day + current
//    + upcoming events, so the frontend gets the full set

import { NextResponse } from "next/server";

const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:8000";

export async function GET() {
  try {
    const res = await fetch(`${BACKEND_URL}/api/v1/src/events`, {
      cache: "no-store",
      next: { revalidate: 3600 },
    });

    if (!res.ok) {
      console.error("[src-events] Backend returned", res.status);
      return NextResponse.json([], { status: res.status });
    }

    const json = await res.json();

    // Map SRCEvent (backend) → CalEvent (EventsBanner.tsx)
    const events = (json.data ?? []).map((e: any) => ({
      uid:         e.uid,
      summary:     e.title,
      description: e.description ?? "",
      location:    e.location    ?? "",
      dtstart:     e.startTime,
      dtend:       e.endTime,
      url:         e.url         ?? "",
      imageUrl:    e.imageUrl    ?? null,   // ← scraped og:image from service
      allDay:      e.isAllDay    ?? false,
      categories:  e.categories  ?? [],
    }));

    return NextResponse.json(events);
  } catch (err) {
    console.error("[src-events] error:", err);
    return NextResponse.json([], { status: 500 });
  }
}
