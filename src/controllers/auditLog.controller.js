import AuditLog from "../models/AuditLog.model.js";

/**
 * GET /api/audit-logs/my-logs
 * Retrieves paginated audit logs for the authenticated user.
 */
export const getMyAuditLogs = async (req, res) => {
    try {
        if (!req.user || !req.user._id) {
            return res.status(401).json({ message: "Unauthorized: User identification missing." });
        }

        const page = Math.max(1, parseInt(req.query.page, 10) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
        const skip = (page - 1) * limit;

        const query = { user: req.user._id };

        // Optional filter: action
        if (req.query.action) {
            query.action = req.query.action;
        }

        // Optional filter: date range
        if (req.query.startDate || req.query.endDate) {
            query.createdAt = {};
            if (req.query.startDate) {
                query.createdAt.$gte = new Date(req.query.startDate);
            }
            if (req.query.endDate) {
                query.createdAt.$lte = new Date(req.query.endDate);
            }
        }

        const [logs, total] = await Promise.all([
            AuditLog.find(query)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            AuditLog.countDocuments(query)
        ]);

        const totalPages = Math.ceil(total / limit) || 1;

        return res.status(200).json({
            success: true,
            logs,
            pagination: {
                total,
                page,
                limit,
                totalPages,
                hasNextPage: page < totalPages,
                hasPrevPage: page > 1
            }
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: "Failed to fetch audit logs",
            error: error.message
        });
    }
};

/**
 * GET /api/audit-logs/system
 * Restricted to System Users (Admins).
 * Retrieves global compliance audit logs with filtering and pagination.
 */
export const getSystemAuditLogs = async (req, res) => {
    try {
        // Double-check: enforce system user role
        if (!req.user || !req.user.systemUser) {
            return res.status(403).json({
                success: false,
                message: "Access Denied: System User privileges required to access system audit trail."
            });
        }

        const page = Math.max(1, parseInt(req.query.page, 10) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
        const skip = (page - 1) * limit;

        const query = {};

        // Optional filter: specific user
        if (req.query.userId) {
            query.user = req.query.userId;
        }

        // Optional filter: action
        if (req.query.action) {
            query.action = req.query.action;
        }

        // Optional filter: target resource
        if (req.query.targetResource) {
            query.targetResource = req.query.targetResource;
        }

        // Optional filter: date range
        if (req.query.startDate || req.query.endDate) {
            query.createdAt = {};
            if (req.query.startDate) {
                query.createdAt.$gte = new Date(req.query.startDate);
            }
            if (req.query.endDate) {
                query.createdAt.$lte = new Date(req.query.endDate);
            }
        }

        const [logs, total] = await Promise.all([
            AuditLog.find(query)
                .populate("user", "username email systemUser")
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            AuditLog.countDocuments(query)
        ]);

        const totalPages = Math.ceil(total / limit) || 1;

        return res.status(200).json({
            success: true,
            logs,
            pagination: {
                total,
                page,
                limit,
                totalPages,
                hasNextPage: page < totalPages,
                hasPrevPage: page > 1
            }
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: "Failed to fetch system audit logs",
            error: error.message
        });
    }
};
