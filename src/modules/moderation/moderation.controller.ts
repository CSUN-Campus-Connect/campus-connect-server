import { Request, Response } from "express";
import prisma from "@/utils/prisma";
import { logAdminAction } from "@/utils/audit";

export const submitReport = async (req: Request, res: Response): Promise<void> => {
  try {
    const { targetType, targetId, reason, description } = req.body;

    if (!targetType || !targetId || !reason) {
      res.status(400).json({ error: "targetType, targetId, and reason are required" });
      return;
    }

    const validTypes = ["POST", "COMMENT", "USER", "MARKETPLACE_LISTING", "CLUB", "EVENT", "MESSAGE"];
    if (!validTypes.includes(targetType)) {
      res.status(400).json({ error: "Invalid targetType" });
      return;
    }

    const validReasons = [
      "SPAM", "HARASSMENT", "HATE_SPEECH", "VIOLENCE", "SEXUAL_CONTENT",
      "MISINFORMATION", "SCAM", "IMPERSONATION", "INTELLECTUAL_PROPERTY",
      "SELF_HARM", "ILLEGAL_ACTIVITY", "PRIVACY_VIOLATION", "OTHER",
    ];
    if (!validReasons.includes(reason)) {
      res.status(400).json({ error: "Invalid reason" });
      return;
    }

    const existing = await prisma.contentReport.findFirst({
      where: {
        reporterId: req.user!.id,
        targetType,
        targetId,
        status: { in: ["PENDING", "IN_REVIEW"] },
      },
    });
    if (existing) {
      res.status(409).json({ error: "You have already reported this content" });
      return;
    }

    const urgentReasons = ["SELF_HARM", "VIOLENCE", "SEXUAL_CONTENT"];
    const priority = urgentReasons.includes(reason) ? "URGENT" : "NORMAL";

    const report = await prisma.contentReport.create({
      data: {
        reporterId: req.user!.id,
        targetType,
        targetId,
        reason,
        description: description || null,
        priority,
      },
    });

    res.status(201).json({
      id: report.id,
      status: report.status,
      message: "Report submitted. Our team will review it shortly.",
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to submit report" });
  }
};

export const getQueue = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const status = req.query.status as string;
    const priority = req.query.priority as string;
    const targetType = req.query.targetType as string;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (status) where.status = status;
    if (priority) where.priority = priority;
    if (targetType) where.targetType = targetType;

    const [reports, total] = await Promise.all([
      prisma.contentReport.findMany({
        where,
        include: {
          reporter: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
          assignedTo: {
            select: { id: true, firstName: true, lastName: true },
          },
        },
        orderBy: [
          { priority: "desc" },
          { createdAt: "desc" },
        ],
        skip,
        take: limit,
      }),
      prisma.contentReport.count({ where }),
    ]);

    res.json({
      reports,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch queue" });
  }
};

const fetchTargetContent = async (targetType: string, targetId: string) => {
  try {
    switch (targetType) {
      case "POST":
        return await prisma.post.findUnique({
          where: { id: targetId },
          include: {
            User: { select: { id: true, firstName: true, lastName: true, email: true } },
          },
        });
      case "COMMENT":
        return await prisma.comment.findUnique({
          where: { id: targetId },
          include: {
            User: { select: { id: true, firstName: true, lastName: true, email: true } },
            Post: { select: { id: true, content: true } },
          },
        });
      case "USER":
        return await prisma.user.findUnique({
          where: { id: targetId },
          select: {
            id: true, firstName: true, lastName: true, email: true,
            bio: true, profilePicture: true, userType: true, createdAt: true,
          },
        });
      case "MARKETPLACE_LISTING":
        return await prisma.marketplaceListing.findUnique({
          where: { id: targetId },
          include: {
            seller: { select: { id: true, firstName: true, lastName: true, email: true } },
          },
        });
      case "CLUB":
        return await prisma.club.findUnique({
          where: { id: targetId },
          include: {
            createdBy: { select: { id: true, firstName: true, lastName: true } },
          },
        });
      case "EVENT":
        return await prisma.event.findUnique({
          where: { id: targetId },
          include: {
            createdBy: { select: { id: true, firstName: true, lastName: true } },
          },
        });
      case "MESSAGE":
        return await prisma.message.findUnique({
          where: { id: targetId },
          include: {
            Sender: { select: { id: true, firstName: true, lastName: true } },
          },
        });
      default:
        return null;
    }
  } catch {
    return null;
  }
};

export const getReportDetail = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;

    const report = await prisma.contentReport.findUnique({
      where: { id },
      include: {
        reporter: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        assignedTo: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        actions: {
          include: {
            moderator: {
              select: { id: true, firstName: true, lastName: true },
            },
          },
          orderBy: { createdAt: "desc" },
        },
      },
    });

    if (!report) {
      res.status(404).json({ error: "Report not found" });
      return;
    }

    const targetContent = await fetchTargetContent(report.targetType, report.targetId);

    const otherReports = await prisma.contentReport.count({
      where: {
        targetType: report.targetType,
        targetId: report.targetId,
        id: { not: report.id },
      },
    });

    res.json({
      ...report,
      targetContent,
      otherReportsOnTarget: otherReports,
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch report" });
  }
};

export const claimReport = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;

    const report = await prisma.contentReport.findUnique({ where: { id } });
    if (!report) {
      res.status(404).json({ error: "Report not found" });
      return;
    }

    if (report.assignedToId && report.assignedToId !== req.user!.id) {
      res.status(409).json({ error: "Report is already claimed by another moderator" });
      return;
    }

    await prisma.contentReport.update({
      where: { id },
      data: {
        assignedToId: req.user!.id,
        status: "IN_REVIEW",
      },
    });

    await logAdminAction(req, "moderation:claimed", `report:${id}`);

    res.json({ message: "Report claimed" });
  } catch (error) {
    res.status(500).json({ error: "Failed to claim report" });
  }
};

export const updateReportStatus = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const { status } = req.body;

    const validStatuses = ["PENDING", "IN_REVIEW", "RESOLVED", "DISMISSED", "ESCALATED"];
    if (!validStatuses.includes(status)) {
      res.status(400).json({ error: "Invalid status" });
      return;
    }

    const report = await prisma.contentReport.findUnique({ where: { id } });
    if (!report) {
      res.status(404).json({ error: "Report not found" });
      return;
    }

    const updateData: any = { status };
    if (status === "RESOLVED" || status === "DISMISSED") {
      updateData.resolvedAt = new Date();
    }

    await prisma.contentReport.update({ where: { id }, data: updateData });
    await logAdminAction(req, "moderation:status_updated", `report:${id}`, { from: report.status, to: status });

    if (status === "RESOLVED" || status === "DISMISSED") {
      await prisma.notification.create({
        data: {
          userId: report.reporterId,
          type: "contentReportUpdate",
          title: "Report reviewed",
          body: status === "RESOLVED"
            ? "Your report has been reviewed and action was taken."
            : "Your report has been reviewed. No violation was found.",
        },
      });
    }

    res.json({ message: `Status updated to ${status}` });
  } catch (error) {
    res.status(500).json({ error: "Failed to update status" });
  }
};

export const takeAction = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const { action, note } = req.body;

    const validActions = [
      "CONTENT_REMOVED", "CONTENT_RESTORED", "USER_WARNED",
      "USER_SUSPENDED", "USER_BANNED", "REPORT_DISMISSED",
      "REPORT_ESCALATED", "NOTE_ADDED",
    ];
    if (!validActions.includes(action)) {
      res.status(400).json({ error: "Invalid action" });
      return;
    }

    const report = await prisma.contentReport.findUnique({ where: { id } });
    if (!report) {
      res.status(404).json({ error: "Report not found" });
      return;
    }

    await prisma.moderationAction.create({
      data: {
        reportId: id,
        moderatorId: req.user!.id,
        action,
        note: note || null,
      },
    });

    if (action === "CONTENT_REMOVED") {
      await handleContentRemoval(report.targetType, report.targetId);
      await prisma.contentReport.update({
        where: { id },
        data: { status: "RESOLVED", resolvedAt: new Date(), resolution: "Content removed" },
      });
    }

    if (action === "REPORT_DISMISSED") {
      await prisma.contentReport.update({
        where: { id },
        data: { status: "DISMISSED", resolvedAt: new Date(), resolution: "Dismissed — no violation" },
      });
    }

    if (action === "REPORT_ESCALATED") {
      await prisma.contentReport.update({
        where: { id },
        data: { status: "ESCALATED", priority: "URGENT" },
      });
    }

    if (action === "USER_WARNED" || action === "USER_SUSPENDED" || action === "USER_BANNED") {
      const targetUserId = await getContentOwnerId(report.targetType, report.targetId);
      if (targetUserId) {
        const violationType = action === "USER_WARNED" ? "WARNING"
          : action === "USER_SUSPENDED" ? "TEMPORARY_SUSPENSION"
          : "PERMANENT_BAN";

        await prisma.userViolation.create({
          data: {
            userId: targetUserId,
            type: violationType,
            reason: note || `Moderation action on reported ${report.targetType.toLowerCase()}`,
            reportId: id,
            issuedById: req.user!.id,
            expiresAt: action === "USER_SUSPENDED" ? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) : null,
          },
        });

        await prisma.notification.create({
          data: {
            userId: targetUserId,
            type: action === "USER_WARNED" ? "accountWarning" : "accountSuspended",
            title: action === "USER_WARNED" ? "Content warning" : "Account suspended",
            body: note || "A moderation action has been taken on your account.",
          },
        });
      }
    }

    await logAdminAction(req, `moderation:${action.toLowerCase()}`, `report:${id}`, { action, note });

    res.json({ message: `Action ${action} taken` });
  } catch (error) {
    res.status(500).json({ error: "Failed to take action" });
  }
};

const handleContentRemoval = async (targetType: string, targetId: string) => {
  try {
    switch (targetType) {
      case "POST":
        await prisma.post.delete({ where: { id: targetId } });
        break;
      case "COMMENT":
        await prisma.comment.delete({ where: { id: targetId } });
        break;
      case "MARKETPLACE_LISTING":
        await prisma.marketplaceListing.update({
          where: { id: targetId },
          data: { status: "deleted" },
        });
        break;
      case "MESSAGE":
        await prisma.message.update({
          where: { id: targetId },
          data: { isDeleted: true, content: "[Removed by moderator]" },
        });
        break;
    }
  } catch {}
};

const getContentOwnerId = async (targetType: string, targetId: string): Promise<string | null> => {
  try {
    switch (targetType) {
      case "POST": {
        const post = await prisma.post.findUnique({ where: { id: targetId }, select: { userId: true } });
        return post?.userId || null;
      }
      case "COMMENT": {
        const comment = await prisma.comment.findUnique({ where: { id: targetId }, select: { userId: true } });
        return comment?.userId || null;
      }
      case "USER":
        return targetId;
      case "MARKETPLACE_LISTING": {
        const listing = await prisma.marketplaceListing.findUnique({ where: { id: targetId }, select: { sellerId: true } });
        return listing?.sellerId || null;
      }
      case "CLUB": {
        const club = await prisma.club.findUnique({ where: { id: targetId }, select: { createdById: true } });
        return club?.createdById || null;
      }
      case "MESSAGE": {
        const msg = await prisma.message.findUnique({ where: { id: targetId }, select: { senderId: true } });
        return msg?.senderId || null;
      }
      default:
        return null;
    }
  } catch {
    return null;
  }
};

export const getStats = async (req: Request, res: Response): Promise<void> => {
  try {
    const [pending, inReview, resolved, dismissed, escalated, byReason, byType] = await Promise.all([
      prisma.contentReport.count({ where: { status: "PENDING" } }),
      prisma.contentReport.count({ where: { status: "IN_REVIEW" } }),
      prisma.contentReport.count({ where: { status: "RESOLVED" } }),
      prisma.contentReport.count({ where: { status: "DISMISSED" } }),
      prisma.contentReport.count({ where: { status: "ESCALATED" } }),
      prisma.contentReport.groupBy({ by: ["reason"], _count: true, orderBy: { _count: { reason: "desc" } } }),
      prisma.contentReport.groupBy({ by: ["targetType"], _count: true, orderBy: { _count: { targetType: "desc" } } }),
    ]);

    res.json({
      byStatus: { pending, inReview, resolved, dismissed, escalated },
      byReason: Object.fromEntries(byReason.map((r) => [r.reason, r._count])),
      byType: Object.fromEntries(byType.map((t) => [t.targetType, t._count])),
      total: pending + inReview + resolved + dismissed + escalated,
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch stats" });
  }
};