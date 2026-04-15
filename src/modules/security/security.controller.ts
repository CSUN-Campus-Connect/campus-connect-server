import { Request, Response } from "express";
import { logAdminAction } from "@/utils/audit";
import * as securityService from "./security.service";

export const submitReport = async (req: Request, res: Response): Promise<void> => {
  try {
    const { reportType, title, description, incidentDate } = req.body;
    if (!reportType || !title || !description || !incidentDate) {
      res.status(400).json({ error: "reportType, title, description, and incidentDate are required" });
      return;
    }

    const report = await securityService.createReport(req.user!.id, req.body);
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
    const { reportType, title, description, incidentDate } = req.body;
    if (!reportType || !title || !description || !incidentDate) {
      res.status(400).json({ error: "reportType, title, description, and incidentDate are required" });
      return;
    }

    const { report, anonymousToken } = await securityService.createAnonymousReport(req.body);
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
    const report = await securityService.findByAnonymousToken(token);
    if (!report) {
      res.status(404).json({ error: "Invalid tracking token" });
      return;
    }

    res.json({
      caseNumber: report.caseNumber,
      status: securityService.simplifyStatus(report.status),
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
    const reports = await securityService.findByReporter(req.user!.id);
    res.json(reports);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch reports" });
  }
};

export const getReportDetail = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const report = await securityService.findReportForReporter(id);
    if (!report) {
      res.status(404).json({ error: "Report not found" });
      return;
    }
    if (report.reporterId !== req.user!.id) {
      res.status(403).json({ error: "Not authorized to view this report" });
      return;
    }

    res.json({
      id: report.id,
      caseNumber: report.caseNumber,
      title: report.title,
      description: report.description,
      reportType: report.reportType,
      status: securityService.simplifyStatus(report.status),
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

    const report = await securityService.findReportForReporter(id);
    if (!report || report.reporterId !== req.user!.id) {
      res.status(403).json({ error: "Not authorized" });
      return;
    }

    const message = await securityService.createReporterMessage(id, req.user!.id, content);
    res.status(201).json(message);
  } catch (error) {
    res.status(500).json({ error: "Failed to send message" });
  }
};

export const uploadReporterEvidence = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    if (!req.file) {
      res.status(400).json({ error: "No file provided" });
      return;
    }

    const report = await securityService.findReportForReporter(id);
    if (!report || report.reporterId !== req.user!.id) {
      res.status(403).json({ error: "Not authorized" });
      return;
    }

    if (!securityService.ALLOWED_EVIDENCE_TYPES.includes(req.file.mimetype)) {
      res.status(400).json({ error: "File type not allowed" });
      return;
    }

    const evidence = await securityService.uploadEvidenceFile(id, req.user!.id, req.file, req.body.description);
    res.status(201).json(evidence);
  } catch (error) {
    res.status(500).json({ error: "Failed to upload evidence" });
  }
};

// ADMIN ENDPOINTS


export const getCaseQueue = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const { cases, total } = await securityService.getCases(
      { status: req.query.status, department: req.query.department, urgency: req.query.urgency },
      page, limit,
    );

    res.json({ cases, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch cases" });
  }
};

export const getCaseDetail = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const report = await securityService.getCaseById(id);
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

    const report = await securityService.updateStatus(id, status, req.user!.id, note, resolutionSummary);
    if (!report) {
      res.status(404).json({ error: "Case not found" });
      return;
    }

    await logAdminAction(req, "security:status_updated", `case:${id}`, {
      caseNumber: report.caseNumber, from: report.status, to: status,
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

    const result = await securityService.assignToUser(id, assigneeId);
    if (!result) {
      res.status(404).json({ error: "Case or assignee not found" });
      return;
    }

    await logAdminAction(req, "security:assigned", `case:${id}`, {
      caseNumber: result.report.caseNumber,
      assigneeName: `${result.assignee.firstName} ${result.assignee.lastName}`,
    });

    res.json({ message: `Case assigned to ${result.assignee.firstName} ${result.assignee.lastName}` });
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

    const caseExists = await securityService.getCaseById(id);
    if (!caseExists) {
      res.status(404).json({ error: "Case not found" });
      return;
    }

    const message = await securityService.createHandlerMessage(id, req.user!.id, content, isInternal || false);
    res.status(201).json(message);
  } catch (error) {
    res.status(500).json({ error: "Failed to send message" });
  }
};

export const getCaseMessages = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const messages = await securityService.getMessages(id);
    res.json(messages);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch messages" });
  }
};

export const addInvolvedParty = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const caseExists = await securityService.getCaseById(id);
    if (!caseExists) {
      res.status(404).json({ error: "Case not found" });
      return;
    }

    const party = await securityService.createInvolvedParty(id, req.body);
    res.status(201).json(party);
  } catch (error) {
    res.status(500).json({ error: "Failed to add involved party" });
  }
};

export const getSecurityStats = async (req: Request, res: Response): Promise<void> => {
  try {
    const stats = await securityService.getStats();
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch stats" });
  }
};

export const uploadEvidence = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    if (!req.file) {
      res.status(400).json({ error: "No file provided" });
      return;
    }

    const report = await securityService.getCaseById(id);
    if (!report) {
      res.status(404).json({ error: "Case not found" });
      return;
    }

    if (!securityService.ALLOWED_EVIDENCE_TYPES.includes(req.file.mimetype)) {
      res.status(400).json({ error: "File type not allowed. Accepted: images, video, PDF, audio" });
      return;
    }

    const evidence = await securityService.uploadEvidenceFile(id, req.user!.id, req.file, req.body.description);

    await logAdminAction(req, "security:evidence_uploaded", `case:${id}`, {
      caseNumber: report.caseNumber,
      fileName: req.file.originalname,
      fileSize: req.file.size,
    });

    res.status(201).json(evidence);
  } catch (error) {
    console.error("Evidence upload error:", error);
    res.status(500).json({ error: "Failed to upload evidence" });
  }
};