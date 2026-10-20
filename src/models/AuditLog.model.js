import mongoose from "mongoose";

/**
 * Audit Actions Enum for Enterprise Banking Compliance
 * Strictly tracks high-security identity, account lifecycle, and financial operations.
 */
export const AUDIT_ACTIONS = [
    "USER_REGISTERED",
    "USER_LOGIN",
    "USER_LOGOUT",
    "ACCOUNT_CREATED",
    "ACCOUNT_STATUS_CHANGED",
    "MONEY_TRANSFER",
    "SYSTEM_INITIAL_FUNDS"
];

const auditLogSchema = new mongoose.Schema(
    {
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: [true, "AuditLog must be associated with a user."],
            index: true,
            immutable: true
        },
        action: {
            type: String,
            enum: {
                values: AUDIT_ACTIONS,
                message: "Action must be one of: " + AUDIT_ACTIONS.join(", ")
            },
            required: [true, "AuditLog action is required."],
            index: true,
            immutable: true
        },
        targetResource: {
            type: String,
            required: [true, "Target resource is required for audit trail."],
            trim: true,
            immutable: true
        },
        resourceId: {
            type: mongoose.Schema.Types.ObjectId,
            default: null,
            immutable: true
        },
        details: {
            type: mongoose.Schema.Types.Mixed,
            default: {},
            immutable: true
        },
        ipAddress: {
            type: String,
            default: "unknown",
            trim: true,
            immutable: true
        }
    },
    {
        timestamps: true // Captures createdAt and updatedAt
    }
);

// High-performance compound indexes for regulatory compliance and audit queries
auditLogSchema.index({ user: 1, action: 1 });
auditLogSchema.index({ createdAt: -1 });
auditLogSchema.index({ targetResource: 1, resourceId: 1 });

/**
 * =========================================================================
 * IMMUTABILITY ENFORCEMENT HOOKS
 * Audit records must be strictly APPEND-ONLY.
 * Any attempt to update, alter, or delete existing records is rejected.
 * =========================================================================
 */

function preventAuditLogMutation() {
    throw new Error(
        "Security Error: AuditLog records are strictly IMMUTABLE. Updates and deletions are permanently prohibited by enterprise compliance policy."
    );
}

// 1. Document-level hooks: Block updating existing documents on save or delete
auditLogSchema.pre("save", function () {
    if (!this.isNew) {
        throw new Error(
            "Security Error: AuditLog records are strictly IMMUTABLE and cannot be modified after creation."
        );
    }
});

auditLogSchema.pre("deleteOne", { document: true, query: false }, preventAuditLogMutation);
auditLogSchema.pre("remove", preventAuditLogMutation);

// 2. Query-level hooks: Block all Mongoose query methods that modify or remove records
const blockedQueryOperations = [
    "updateOne",
    "updateMany",
    "findOneAndUpdate",
    "replaceOne",
    "findOneAndReplace",
    "findByIdAndUpdate",
    "deleteOne",
    "deleteMany",
    "findOneAndDelete",
    "findByIdAndDelete"
];

blockedQueryOperations.forEach((operation) => {
    try {
        auditLogSchema.pre(operation, preventAuditLogMutation);
    } catch (_) {
        // Safe registration fallback
    }
});

const AuditLog = mongoose.models.AuditLog || mongoose.model("AuditLog", auditLogSchema);

// Register alias for lowercase 'auditlog' to avoid casing mismatch in dynamic lookups
if (!mongoose.models.auditLog) {
    mongoose.model("auditLog", auditLogSchema);
}

export default AuditLog;
