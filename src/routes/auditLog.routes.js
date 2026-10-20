import express from "express";
import { authMiddleware, authSystemUserMiddleware } from "../middleware/auth.middleware.js";
import { getMyAuditLogs, getSystemAuditLogs } from "../controllers/auditLog.controller.js";

const router = express.Router();

/**
 * GET /api/audit-logs/my-logs
 * Protected: Authenticated regular users
 */
router.get("/my-logs", authMiddleware, getMyAuditLogs);

/**
 * GET /api/audit-logs/system
 * Protected: System Users (Admins) only
 */
router.get("/system", authSystemUserMiddleware, getSystemAuditLogs);

export default router;
