// src/modules/security/security.service.ts
import prisma from "@/utils/prisma";
import { SecurityDepartment, SecurityUrgency } from "@prisma/client";
import { s3Service } from "@/services/s3.service";
import crypto from "crypto";

const REPORT_TYPE_ROUTING: Record<string, SecurityDepartment> = {
  CRIMINAL: "DPS",
  SAFETY_HAZARD: "DPS",
  DISCRIMINATION: "OEC",
  SEXUAL_VIOLENCE: "OEC",
  MISCONDUCT: "OSCED",
  ACADEMIC_DISHONESTY: "OSCED",
  DISTURBANCE: "HOUSING",
  SUSPICIOUS_ACTIVITY: "DPS",
  ESCORT_REQUEST: "DPS",
  LOST_FOUND: "PARKING",
  PARKING: "PARKING",
  ANONYMOUS_TIP: "DPS",
  MENTAL_HEALTH: "UCS",
};

const URGENCY_MAP: Record<string, SecurityUrgency> = {
  CRIMINAL: "HIGH",
  SEXUAL_VIOLENCE: "CRITICAL",
  SUSPICIOUS_ACTIVITY: "MEDIUM",
  SAFETY_HAZARD: "MEDIUM",
  DISCRIMINATION: "HIGH",
  MISCONDUCT: "MEDIUM",
  ACADEMIC_DISHONESTY: "MEDIUM",
  DISTURBANCE: "LOW",
  ESCORT_REQUEST: "TIME_SENSITIVE",
  LOST_FOUND: "LOW",
  PARKING: "LOW",
  ANONYMOUS_TIP: "MEDIUM",
  MENTAL_HEALTH: "HIGH",
};

export const generateCaseNumber = (): string => {
  const date = new Date();
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const rand = String(Math.floor(Math.random() * 10000)).padStart(4, "0");
  return `SR-${y}${m}${d}-${rand}`;
};

export const getDepartment = (reportType: string): SecurityDepartment => {
  return REPORT_TYPE_ROUTING[reportType] || "DPS";
};

export const getUrgency = (reportType: string): SecurityUrgency => {
  return URGENCY_MAP[reportType] || "MEDIUM";
};

export const simplifyStatus = (status: string): string => {
  if (["SUBMITTED", "ACKNOWLEDGED"].includes(status)) return "Submitted";
  if (["UNDER_REVIEW", "INVESTIGATION", "ESCALATED", "PENDING_RESOLUTION"].includes(status)) return "In Progress";
  if (status === "RESOLVED") return "Resolved";
  return "Closed";
};

export const createReport = async (userId: string, data: any) => {
  const caseNumber = generateCaseNumber();
  const department = getDepartment(data.reportType);
  const urgency = getUrgency(data.reportType);

  const report = await prisma.securityReport.create({
    data: {
      caseNumber,
      reporterId: userId,
      reportType: data.reportType,
      urgency,
      title: data.title,
      description: data.description,
      location: data.location || null,
      latitude: data.latitude || null,
      longitude: data.longitude || null,
      incidentDate: new Date(data.incidentDate),
      assignedDepartment: department,
      reporterRelationship: data.reporterRelationship || "VICTIM",
    },
  });

  if (data.involvedParties && Array.isArray(data.involvedParties)) {
    for (const party of data.involvedParties) {
      await prisma.reportInvolvedParty.create({
        data: {
          reportId: report.id,
          name: party.name || null,
          description: party.description || null,
          affiliation: party.affiliation || null,
          relationToReporter: party.relationToReporter || null,
        },
      });
    }
  }

  await prisma.reportStatusHistory.create({
    data: {
      reportId: report.id,
      previousStatus: "NONE",
      newStatus: "SUBMITTED",
      changedById: userId,
      note: "Report submitted",
    },
  });

  return report;
};

export const createAnonymousReport = async (data: any) => {
  const caseNumber = generateCaseNumber();
  const department = getDepartment(data.reportType);
  const urgency = getUrgency(data.reportType);
  const anonymousToken = crypto.randomBytes(16).toString("hex");

  const report = await prisma.securityReport.create({
    data: {
      caseNumber,
      reportType: data.reportType,
      urgency,
      title: data.title,
      description: data.description,
      location: data.location || null,
      incidentDate: new Date(data.incidentDate),
      assignedDepartment: department,
      isAnonymous: true,
      anonymousToken,
    },
  });

  await prisma.reportStatusHistory.create({
    data: {
      reportId: report.id,
      previousStatus: "NONE",
      newStatus: "SUBMITTED",
      changedById: "anonymous",
      note: "Anonymous report submitted",
    },
  });

  return { report, anonymousToken };
};

export const findByAnonymousToken = async (token: string) => {
  return prisma.securityReport.findUnique({
    where: { anonymousToken: token },
    select: {
      caseNumber: true,
      status: true,
      reportType: true,
      assignedDepartment: true,
      createdAt: true,
      resolutionSummary: true,
      messages: {
        where: { isInternal: false },
        select: { content: true, senderRole: true, createdAt: true },
        orderBy: { createdAt: "asc" },
      },
    },
  });
};

export const findByReporter = async (userId: string) => {
  return prisma.securityReport.findMany({
    where: { reporterId: userId },
    select: {
      id: true,
      caseNumber: true,
      title: true,
      reportType: true,
      status: true,
      urgency: true,
      assignedDepartment: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });
};

export const findReportForReporter = async (id: string) => {
  return prisma.securityReport.findUnique({
    where: { id },
    include: {
      messages: { where: { isInternal: false }, orderBy: { createdAt: "asc" } },
      statusHistory: { orderBy: { createdAt: "desc" }, take: 10 },
    },
  });
};

export const createReporterMessage = async (reportId: string, senderId: string, content: string) => {
  return prisma.reportMessage.create({
    data: { reportId, senderId, senderRole: "REPORTER", content },
  });
};

export const getCases = async (filters: any, page: number, limit: number) => {
  const skip = (page - 1) * limit;
  const where: any = {};
  if (filters.status) where.status = filters.status;
  if (filters.department) where.assignedDepartment = filters.department;
  if (filters.urgency) where.urgency = filters.urgency;

  const [cases, total] = await Promise.all([
    prisma.securityReport.findMany({
      where,
      include: {
        reporter: { select: { id: true, firstName: true, lastName: true, email: true } },
        assignedTo: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: [{ urgency: "asc" }, { createdAt: "desc" }],
      skip,
      take: limit,
    }),
    prisma.securityReport.count({ where }),
  ]);

  return { cases, total };
};

export const getCaseById = async (id: string) => {
  return prisma.securityReport.findUnique({
    where: { id },
    include: {
      reporter: { select: { id: true, firstName: true, lastName: true, email: true, userType: true } },
      assignedTo: { select: { id: true, firstName: true, lastName: true, email: true } },
      evidence: { orderBy: { uploadedAt: "desc" } },
      statusHistory: { orderBy: { createdAt: "desc" } },
      messages: { orderBy: { createdAt: "asc" } },
      involvedParties: true,
      childReports: { select: { id: true, caseNumber: true, title: true, status: true } },
    },
  });
};

export const updateStatus = async (id: string, status: string, changedById: string, note?: string, resolutionSummary?: string) => {
  const report = await prisma.securityReport.findUnique({ where: { id } });
  if (!report) return null;

  const updateData: any = { status };
  if (status === "RESOLVED" || status === "CLOSED") {
    updateData.resolvedAt = new Date();
    if (resolutionSummary) updateData.resolutionSummary = resolutionSummary;
  }

  await prisma.securityReport.update({ where: { id }, data: updateData });

  await prisma.reportStatusHistory.create({
    data: {
      reportId: id,
      previousStatus: report.status,
      newStatus: status,
      changedById,
      note: note || null,
    },
  });

  return report;
};

export const assignToUser = async (id: string, assigneeId: string) => {
  const [report, assignee] = await Promise.all([
    prisma.securityReport.findUnique({ where: { id } }),
    prisma.user.findUnique({ where: { id: assigneeId }, select: { id: true, firstName: true, lastName: true } }),
  ]);

  if (!report || !assignee) return null;

  await prisma.securityReport.update({ where: { id }, data: { assignedToId: assigneeId } });

  return { report, assignee };
};

export const createHandlerMessage = async (reportId: string, senderId: string, content: string, isInternal: boolean) => {
  return prisma.reportMessage.create({
    data: { reportId, senderId, senderRole: "HANDLER", content, isInternal },
  });
};

export const getMessages = async (reportId: string) => {
  return prisma.reportMessage.findMany({
    where: { reportId },
    orderBy: { createdAt: "asc" },
  });
};

export const createInvolvedParty = async (reportId: string, data: any) => {
  return prisma.reportInvolvedParty.create({
    data: {
      reportId,
      name: data.name || null,
      description: data.description || null,
      affiliation: data.affiliation || null,
      relationToReporter: data.relationToReporter || null,
    },
  });
};

export const getStats = async () => {
  const [byStatus, byDepartment, byType, byUrgency, total] = await Promise.all([
    prisma.securityReport.groupBy({ by: ["status"], _count: true }),
    prisma.securityReport.groupBy({ by: ["assignedDepartment"], _count: true }),
    prisma.securityReport.groupBy({ by: ["reportType"], _count: true, orderBy: { _count: { reportType: "desc" } } }),
    prisma.securityReport.groupBy({ by: ["urgency"], _count: true }),
    prisma.securityReport.count(),
  ]);

  return {
    total,
    byStatus: Object.fromEntries(byStatus.map((s) => [s.status, s._count])),
    byDepartment: Object.fromEntries(byDepartment.map((d) => [d.assignedDepartment, d._count])),
    byType: Object.fromEntries(byType.map((t) => [t.reportType, t._count])),
    byUrgency: Object.fromEntries(byUrgency.map((u) => [u.urgency, u._count])),
  };
};

export const ALLOWED_EVIDENCE_TYPES = [
  "image/jpeg", "image/png", "image/gif", "image/webp",
  "video/mp4", "video/quicktime",
  "application/pdf",
  "audio/mpeg", "audio/wav",
];

export const uploadEvidenceFile = async (reportId: string, uploadedById: string, file: Express.Multer.File, description?: string) => {
  const { url, checksum } = await s3Service.uploadEvidence(
    file.buffer,
    file.originalname,
    reportId,
    file.mimetype,
  );

  return prisma.reportEvidence.create({
    data: {
      reportId,
      uploadedById,
      fileUrl: url,
      fileName: file.originalname,
      fileType: file.mimetype,
      fileSizeBytes: file.size,
      description: description || null,
      checksumSha256: checksum,
    },
  });
};