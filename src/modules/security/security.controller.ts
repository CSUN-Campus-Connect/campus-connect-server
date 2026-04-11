// src/modules/security/security.controller.ts
import { Request, Response } from "express";
import prisma from "@/utils/prisma";
import { logAdminAction } from "@/utils/audit";
import { SecurityDepartment, SecurityUrgency } from "@prisma/client";
import crypto from "crypto";

const generateCaseNumber = (): string => {
  const date = new Date();
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const rand = String(Math.floor(Math.random() * 10000)).padStart(4, "0");
  return `SR-${y}${m}${d}-${rand}`;
};

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

export const submitReport = async (req: Request, res: Response): Promise<void> => {
  try {
    const { reportType, title, description, location, latitude, longitude, incidentDate, reporterRelationship, involvedParties } = req.body;

    if (!reportType || !title || !description || !incidentDate) {
      res.status(400).json({ error: "reportType, title, description, and incidentDate are required" });
      return;
    }

    const caseNumber = generateCaseNumber();
    const department = REPORT_TYPE_ROUTING[reportType] || "DPS";
    const urgency = URGENCY_MAP[reportType] || "MEDIUM";

    const report = await prisma.securityReport.create({
      data: {
        caseNumber,
        reporterId: req.user!.id,
        reportType,
        urgency,
        title,
        description,
        location: location || null,
        latitude: latitude || null,
        longitude: longitude || null,
        incidentDate: new Date(incidentDate),
        assignedDepartment: department,
        reporterRelationship: reporterRelationship || "VICTIM",
      },
    });

    if (involvedParties && Array.isArray(involvedParties)) {
      for (const party of involvedParties) {
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
        changedById: req.user!.id,
        note: "Report submitted",
      },
    });

    res.status(201).json({
      id: report.id,
      caseNumber: report.caseNumber,
      status: report.status,
      assignedDepartment: report.assignedDepartment,
      message: "Report submitted successfully. Your case number is " + report.caseNumber,
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to submit report" });
  }
};

export const submitAnonymousReport = async (req: Request, res: Response): Promise<void> => {
  try {
    const { reportType, title, description, location, incidentDate } = req.body;

    if (!reportType || !title || !description || !incidentDate) {
      res.status(400).json({ error: "reportType, title, description, and incidentDate are required" });
      return;
    }

    const caseNumber = generateCaseNumber();
    const department = REPORT_TYPE_ROUTING[reportType] || "DPS";
    const urgency = URGENCY_MAP[reportType] || "MEDIUM";
    const anonymousToken = crypto.randomBytes(16).toString("hex");

    const report = await prisma.securityReport.create({
      data: {
        caseNumber,
        reportType,
        urgency,
        title,
        description,
        location: location || null,
        incidentDate: new Date(incidentDate),
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

    res.status(201).json({
      caseNumber: report.caseNumber,
      trackingToken: anonymousToken,
      message: "Anonymous report submitted. Save your tracking token to check status later.",
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to submit anonymous report" });
  }
};

export const trackAnonymousReport = async (req: Request, res: Response): Promise<void> => {
  try {
    const token = req.params.token as string;

    const report = await prisma.securityReport.findUnique({
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

    if (!report) {
      res.status(404).json({ error: "Invalid tracking token" });
      return;
    }

    const simplifiedStatus = ["SUBMITTED", "ACKNOWLEDGED"].includes(report.status)
      ? "Submitted"
      : ["UNDER_REVIEW", "INVESTIGATION", "ESCALATED", "PENDING_RESOLUTION"].includes(report.status)
      ? "In Progress"
      : report.status === "RESOLVED"
      ? "Resolved"
      : "Closed";

    res.json({
      caseNumber: report.caseNumber,
      status: simplifiedStatus,
      reportType: report.reportType,
      department: report.assignedDepartment,
      submittedAt: report.createdAt,
      resolution: report.resolutionSummary,
      messages: report.messages,
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to track report" });
  }
};

export const getMyReports = async (req: Request, res: Response): Promise<void> => {
  try {
    const reports = await prisma.securityReport.findMany({
      where: { reporterId: req.user!.id },
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

    res.json(reports);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch reports" });
  }
};

export const getReportDetail = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;

    const report = await prisma.securityReport.findUnique({
      where: { id },
      include: {
        messages: {
          where: { isInternal: false },
          orderBy: { createdAt: "asc" },
        },
        statusHistory: {
          orderBy: { createdAt: "desc" },
          take: 10,
        },
      },
    });

    if (!report) {
      res.status(404).json({ error: "Report not found" });
      return;
    }

    if (report.reporterId !== req.user!.id) {
      res.status(403).json({ error: "Not authorized to view this report" });
      return;
    }

    const simplifiedStatus = ["SUBMITTED", "ACKNOWLEDGED"].includes(report.status)
      ? "Submitted"
      : ["UNDER_REVIEW", "INVESTIGATION", "ESCALATED", "PENDING_RESOLUTION"].includes(report.status)
      ? "In Progress"
      : report.status === "RESOLVED"
      ? "Resolved"
      : "Closed";

    res.json({
      id: report.id,
      caseNumber: report.caseNumber,
      title: report.title,
      description: report.description,
      reportType: report.reportType,
      status: simplifiedStatus,
      department: report.assignedDepartment,
      location: report.location,
      incidentDate: report.incidentDate,
      createdAt: report.createdAt,
      resolution: report.resolutionSummary,
      messages: report.messages,
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch report" });
  }
};

export const sendMessage = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const { content } = req.body;

    if (!content) {
      res.status(400).json({ error: "content required" });
      return;
    }

    const report = await prisma.securityReport.findUnique({ where: { id }, select: { reporterId: true } });
    if (!report || report.reporterId !== req.user!.id) {
      res.status(403).json({ error: "Not authorized" });
      return;
    }

    const message = await prisma.reportMessage.create({
      data: {
        reportId: id,
        senderId: req.user!.id,
        senderRole: "REPORTER",
        content,
      },
    });

    res.status(201).json(message);
  } catch (error) {
    res.status(500).json({ error: "Failed to send message" });
  }
};

// ============================================================================
// ADMIN ENDPOINTS
// ============================================================================

export const getCaseQueue = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const status = req.query.status as string;
    const department = req.query.department as string;
    const urgency = req.query.urgency as string;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (status) where.status = status;
    if (department) where.assignedDepartment = department;
    if (urgency) where.urgency = urgency;

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

    res.json({
      cases,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch cases" });
  }
};

export const getCaseDetail = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;

    const report = await prisma.securityReport.findUnique({
      where: { id },
      include: {
        reporter: { select: { id: true, firstName: true, lastName: true, email: true, userType: true } },
        assignedTo: { select: { id: true, firstName: true, lastName: true, email: true } },
        evidence: { orderBy: { uploadedAt: "desc" } },
        statusHistory: {
          orderBy: { createdAt: "desc" },
        },
        messages: {
          orderBy: { createdAt: "asc" },
        },
        involvedParties: true,
        childReports: {
          select: { id: true, caseNumber: true, title: true, status: true },
        },
      },
    });

    if (!report) {
      res.status(404).json({ error: "Case not found" });
      return;
    }

    res.json(report);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch case" });
  }
};

export const updateCaseStatus = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const { status, note, resolutionSummary } = req.body;

    const validStatuses = [
      "SUBMITTED", "ACKNOWLEDGED", "UNDER_REVIEW", "INVESTIGATION",
      "ESCALATED", "PENDING_RESOLUTION", "RESOLVED", "CLOSED", "REOPENED",
    ];
    if (!validStatuses.includes(status)) {
      res.status(400).json({ error: "Invalid status" });
      return;
    }

    const report = await prisma.securityReport.findUnique({ where: { id } });
    if (!report) {
      res.status(404).json({ error: "Case not found" });
      return;
    }

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
        changedById: req.user!.id,
        note: note || null,
      },
    });

    await logAdminAction(req, "security:status_updated", `case:${id}`, {
      caseNumber: report.caseNumber,
      from: report.status,
      to: status,
    });

    res.json({ message: `Case status updated to ${status}` });
  } catch (error) {
    res.status(500).json({ error: "Failed to update status" });
  }
};

export const assignCase = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const { assigneeId } = req.body;

    if (!assigneeId) {
      res.status(400).json({ error: "assigneeId required" });
      return;
    }

    const [report, assignee] = await Promise.all([
      prisma.securityReport.findUnique({ where: { id } }),
      prisma.user.findUnique({ where: { id: assigneeId }, select: { id: true, firstName: true, lastName: true } }),
    ]);

    if (!report) {
      res.status(404).json({ error: "Case not found" });
      return;
    }
    if (!assignee) {
      res.status(404).json({ error: "Assignee not found" });
      return;
    }

    await prisma.securityReport.update({
      where: { id },
      data: { assignedToId: assigneeId },
    });

    await logAdminAction(req, "security:assigned", `case:${id}`, {
      caseNumber: report.caseNumber,
      assigneeName: `${assignee.firstName} ${assignee.lastName}`,
    });

    res.json({ message: `Case assigned to ${assignee.firstName} ${assignee.lastName}` });
  } catch (error) {
    res.status(500).json({ error: "Failed to assign case" });
  }
};

export const sendCaseMessage = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const { content, isInternal } = req.body;

    if (!content) {
      res.status(400).json({ error: "content required" });
      return;
    }

    const report = await prisma.securityReport.findUnique({ where: { id } });
    if (!report) {
      res.status(404).json({ error: "Case not found" });
      return;
    }

    const message = await prisma.reportMessage.create({
      data: {
        reportId: id,
        senderId: req.user!.id,
        senderRole: "HANDLER",
        content,
        isInternal: isInternal || false,
      },
    });

    res.status(201).json(message);
  } catch (error) {
    res.status(500).json({ error: "Failed to send message" });
  }
};

export const getCaseMessages = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;

    const messages = await prisma.reportMessage.findMany({
      where: { reportId: id },
      orderBy: { createdAt: "asc" },
    });

    res.json(messages);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch messages" });
  }
};

export const addInvolvedParty = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const { name, description, affiliation, relationToReporter } = req.body;

    const report = await prisma.securityReport.findUnique({ where: { id } });
    if (!report) {
      res.status(404).json({ error: "Case not found" });
      return;
    }

    const party = await prisma.reportInvolvedParty.create({
      data: {
        reportId: id,
        name: name || null,
        description: description || null,
        affiliation: affiliation || null,
        relationToReporter: relationToReporter || null,
      },
    });

    res.status(201).json(party);
  } catch (error) {
    res.status(500).json({ error: "Failed to add involved party" });
  }
};

export const getSecurityStats = async (req: Request, res: Response): Promise<void> => {
  try {
    const [byStatus, byDepartment, byType, byUrgency, total] = await Promise.all([
      prisma.securityReport.groupBy({ by: ["status"], _count: true }),
      prisma.securityReport.groupBy({ by: ["assignedDepartment"], _count: true }),
      prisma.securityReport.groupBy({ by: ["reportType"], _count: true, orderBy: { _count: { reportType: "desc" } } }),
      prisma.securityReport.groupBy({ by: ["urgency"], _count: true }),
      prisma.securityReport.count(),
    ]);

    res.json({
      total,
      byStatus: Object.fromEntries(byStatus.map((s) => [s.status, s._count])),
      byDepartment: Object.fromEntries(byDepartment.map((d) => [d.assignedDepartment, d._count])),
      byType: Object.fromEntries(byType.map((t) => [t.reportType, t._count])),
      byUrgency: Object.fromEntries(byUrgency.map((u) => [u.urgency, u._count])),
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch stats" });
  }
};