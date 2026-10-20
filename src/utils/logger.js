import os from "os";
import AuditLog from "../models/AuditLog.model.js";

/**
 * Resolves the host machine's exact system network IPv4 address.
 * Used for internal operations, system seeding, and server-initiated tasks.
 *
 * @returns {string} E.g., '192.168.1.101' or '127.0.0.1' fallback
 */
export const getSystemServerIp = () => {
    try {
        const interfaces = os.networkInterfaces();
        for (const name of Object.keys(interfaces)) {
            const ifaceList = interfaces[name];
            if (!ifaceList) continue;
            for (const iface of ifaceList) {
                // Pick the first non-internal IPv4 interface
                if (iface.family === "IPv4" && !iface.internal && iface.address) {
                    return iface.address;
                }
            }
        }
    } catch (_) {}
    return "127.0.0.1";
};

/**
 * Extracts and normalizes the exact client IP address from the request.
 * Checks reverse proxy headers, Cloudflare headers, and raw sockets.
 * Normalizes IPv6 loopback ('::1', '::ffff:127.0.0.1') and IPv6-mapped IPv4 prefixes.
 *
 * @param {import("express").Request} [req]
 * @returns {string}
 */
export const getClientIp = (req) => {
    if (!req) {
        return getSystemServerIp();
    }

    // 1. Cloudflare header
    let rawIp = req.headers?.["cf-connecting-ip"];

    // 2. Standard proxy header (first entry in comma-separated list)
    if (!rawIp && req.headers?.["x-forwarded-for"]) {
        const forwarded = req.headers["x-forwarded-for"];
        rawIp = Array.isArray(forwarded)
            ? forwarded[0]
            : forwarded.split(",")[0]?.trim();
    }

    // 3. Nginx / reverse proxy header
    if (!rawIp) {
        rawIp = req.headers?.["x-real-ip"];
    }

    // 4. Express req.ip (when trust proxy is enabled)
    if (!rawIp) {
        rawIp = req.ip;
    }

    // 5. Raw socket remote address
    if (!rawIp) {
        rawIp = req.socket?.remoteAddress || req.connection?.remoteAddress;
    }

    // Fallback to system IP if still not found
    if (!rawIp) {
        return getSystemServerIp();
    }

    let ip = String(rawIp).trim();

    // Normalize IPv6 localhost
    if (ip === "::1" || ip === "::ffff:127.0.0.1") {
        return "127.0.0.1";
    }

    // Strip IPv6-mapped IPv4 prefix (e.g., '::ffff:192.168.1.1' -> '192.168.1.1')
    if (ip.startsWith("::ffff:")) {
        ip = ip.substring(7);
    }

    return ip;
};

/**
 * Secure Helper to create an immutable AuditLog entry.
 * Captures the exact client IP from req, or accepts an explicit ipAddress,
 * or automatically resolves the system host IP address.
 *
 * @param {object} params
 * @param {string|import("mongoose").Types.ObjectId} params.userId - Associated user ID
 * @param {string} params.action - AUDIT_ACTIONS enum string
 * @param {string} params.targetResource - Target entity type (e.g., 'user', 'account', 'transaction')
 * @param {string|import("mongoose").Types.ObjectId} [params.resourceId] - Target entity ID
 * @param {object} [params.details={}] - Additional metadata or context
 * @param {import("express").Request} [params.req] - Express request object
 * @param {string} [params.ipAddress] - Optional explicit IP override
 * @param {import("mongoose").ClientSession} [params.session] - Optional active MongoDB session
 * @returns {Promise<object>} The persisted AuditLog document
 */
export const createAuditLog = async ({
    userId,
    action,
    targetResource,
    resourceId = null,
    details = {},
    req = null,
    ipAddress = null,
    session = null
}) => {
    try {
        if (!userId) {
            console.warn("[AUDIT LOG WARNING] Missing userId for action:", action);
        }

        // Determine exact IP: explicit > from request > system host IP
        const finalIp = ipAddress || getClientIp(req);

        const auditData = {
            user: userId,
            action,
            targetResource,
            resourceId: resourceId || null,
            details: details || {},
            ipAddress: finalIp
        };

        const options = session ? { session } : {};
        const [logEntry] = await AuditLog.create([auditData], options);
        return logEntry;
    } catch (error) {
        console.error("[AUDIT LOG ERROR] Failed to record audit log:", error.message);
        if (session) {
            // Re-throw inside transactions to ensure ACID atomicity
            throw error;
        }
        return null;
    }
};

export default createAuditLog;
