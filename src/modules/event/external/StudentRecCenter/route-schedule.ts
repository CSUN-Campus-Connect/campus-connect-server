const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:8000";

type BackendScheduleItem = {
  id?: string;
  title?: string;
  instructor?: string | null;
  location?: string | null;
  day?: string;
  startTime?: string;
  endTime?: string;
  category?: string;
  description?: string | null;
  shortDescription?: string | null;
  registrationUrl?: string | null;
  imageUrl?: string | null;
  spots?: number | null;
  isAllDay?: boolean;
  startDate?: string | null;
  endDate?: string | null;
  kind?: "class" | "event" | null;
};

type BackendScheduleResponse = {
  data?: BackendScheduleItem[];
};

const CATEGORY_MAP: Record<string, string> = {
  Aquatics: "aquatics",
  "Group Exercise": "cardio",
  Boxing: "hiit",
  Intramural: "sports",
  "Outdoor Adventures": "strength",
  "Special Event": "special",
  Other: "event",
};

const DAY_INDEX: Record<string, number> = {
  Sunday: 0,
  Monday: 1,
  Tuesday: 2,
  Wednesday: 3,
  Thursday: 4,
  Friday: 5,
  Saturday: 6,
};

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return Response.json(body, init);
}

export async function GET(req: Request): Promise<Response> {
  try {
    const reqUrl = new URL(req.url);
    const week = reqUrl.searchParams.get("week") ?? "";
    const day = reqUrl.searchParams.get("day") ?? "";

    const params = new URLSearchParams();
    if (week) params.set("week", week);
    if (day) params.set("day", day);

    const url = `${BACKEND_URL}/api/v1/src/schedule${params.toString() ? `?${params}` : ""}`;

    const res = await fetch(url, {
      cache: "no-store",
      headers: { Accept: "application/json" },
    });

    if (!res.ok) {
      console.error("[src-schedule] Backend returned", res.status);
      return jsonResponse([], { status: res.status });
    }

    const json = (await res.json()) as BackendScheduleResponse;
    const items = Array.isArray(json.data) ? json.data : [];

    const classes = items.map((c) => ({
      id: c.id ?? "",
      name: c.title ?? "",
      instructor: c.instructor ?? "",
      location: c.location ?? "",
      dayOfWeek: DAY_INDEX[c.day ?? ""] ?? 0,
      startTime: c.startTime ?? "00:00",
      endTime: c.endTime ?? "00:00",
      category: CATEGORY_MAP[c.category ?? ""] ?? "event",
      spots: c.spots ?? undefined,
      spotsLeft: c.spots ?? undefined,
      imageUrl: c.imageUrl ?? null,
      description: c.description ?? "",
      shortDescription: c.shortDescription ?? c.description ?? "",
      registrationUrl: c.registrationUrl ?? "",
      isAllDay: Boolean(c.isAllDay),
      startDate: c.startDate ?? null,
      endDate: c.endDate ?? null,
      kind: c.kind ?? "class",
    }));

    return jsonResponse(classes);
  } catch (err) {
    console.error("[src-schedule] error:", err);
    return jsonResponse([], { status: 500 });
  }
}
