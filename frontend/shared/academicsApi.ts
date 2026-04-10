// src/components/shared/academicsApi.ts
// Calls the real CampusConnect backend. No mock fallback.

import type { UniCartClass } from "./constants";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

// Map backend CourseSection → frontend UniCartClass
function mapSection(s: any): UniCartClass {
  return {
    id:             `${s.courseId}-${s.sectionId}`,
    sectionId:      s.sectionId,
    subject:        s.subject,
    number:         s.number,
    title:          s.title,
    units:          s.units,
    semester:       s.semester,
    professor:      s.professor,
    days:           s.days ?? [],
    startTime:      s.startTime ?? "",
    endTime:        s.endTime ?? "",
    location:       s.location ?? undefined,
    isOnline:       s.isOnline,
    seats:          s.seats,
    seatsAvailable: s.seatsAvailable,
    waitlistCount:  s.waitlistCount ?? 0,
    courseType:     s.courseType ?? undefined,
    linkedLab:      s.linkedLab ?? undefined,
    materialCost:   s.materialCost ?? 0,
    prerequisites:  s.prerequisites ?? [],
    tags:           s.tags ?? [],
    description:    s.description ?? "",
  };
}

export async function fetchSections(params: {
  semester?: string;
  dept?: string;
  search?: string;
  level?: string;
  days?: string[];
  unitsMin?: number;
  unitsMax?: number;
  isOnline?: boolean;
  openOnly?: boolean;
  tag?: string;
  page?: number;
  limit?: number;
}): Promise<{ sections: UniCartClass[]; total: number }> {
  const q = new URLSearchParams();
  if (params.semester) q.set("semester", params.semester);
  if (params.dept && params.dept !== "All") q.set("subject", params.dept);
  if (params.search)   q.set("search", params.search);
  if (params.level && params.level !== "All") q.set("level", params.level);
  if (params.days?.length)  q.set("days", params.days.join(","));
  if (params.unitsMin !== undefined) q.set("unitsMin", String(params.unitsMin));
  if (params.unitsMax !== undefined) q.set("unitsMax", String(params.unitsMax));
  if (params.isOnline !== undefined) q.set("isOnline", String(params.isOnline));
  if (params.openOnly)  q.set("openOnly", "true");
  if (params.tag && params.tag !== "All") q.set("tag", params.tag);
  if (params.page)  q.set("page",  String(params.page));
  if (params.limit) q.set("limit", String(params.limit));

  const res = await fetch(`${API}/api/academics/sections?${q}`);
  if (!res.ok) throw new Error(`Sections fetch failed: ${res.status}`);
  const json = await res.json();
  return {
    sections: (json.data ?? []).map(mapSection),
    total: json.total ?? 0,
  };
}

export async function fetchSemesters(): Promise<string[]> {
  const res = await fetch(`${API}/api/academics/semesters`);
  if (!res.ok) throw new Error("Semesters fetch failed");
  const json = await res.json();
  return json.data ?? [];
}

export async function fetchDepartments(): Promise<string[]> {
  const res = await fetch(`${API}/api/academics/departments`);
  if (!res.ok) throw new Error("Departments fetch failed");
  const json = await res.json();
  // Backend returns { code, label, url }[] — extract codes uppercased
  return ["All", ...(json.data ?? []).map((d: any) => (d.code ?? d).toUpperCase())];
}

export async function checkConflictsApi(sections: UniCartClass[]): Promise<Record<string, string[]>> {
  const res = await fetch(`${API}/api/academics/conflicts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sections: sections.map(toBackendSection) }),
  });
  if (!res.ok) throw new Error("Conflict check failed");
  const json = await res.json();
  return json.data ?? {};
}

export async function exportICSApi(sections: UniCartClass[], semester: string): Promise<Blob> {
  const res = await fetch(`${API}/api/academics/export/ics`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sections: sections.map(toBackendSection), semester }),
  });
  if (!res.ok) throw new Error("ICS export failed");
  return res.blob();
}

// Convert UniCartClass back to backend CourseSection shape for POST requests
function toBackendSection(c: UniCartClass) {
  return {
    sectionId:      c.sectionId,
    courseId:       `${c.subject}-${c.number}`,
    subject:        c.subject,
    number:         c.number,
    title:          c.title,
    units:          c.units,
    semester:       c.semester,
    professor:      c.professor,
    days:           c.days ?? null,
    startTime:      c.startTime || null,
    endTime:        c.endTime || null,
    location:       c.location ?? null,
    isOnline:       c.isOnline,
    seats:          c.seats ?? 0,
    seatsAvailable: c.seatsAvailable ?? 0,
    waitlistCount:  c.waitlistCount ?? 0,
    courseType:     c.courseType ?? null,
    linkedLab:      c.linkedLab ?? null,
    materialCost:   c.materialCost ?? 0,
    prerequisites:  c.prerequisites ?? [],
    tags:           c.tags ?? [],
    description:    c.description ?? "",
  };
}
