import mongoose from "mongoose";
import crypto from "crypto";
import accountModel from "../models/account.model.js";
import transactionModel from "../models/transaction.model.js";
import ledgerModel from "../models/ledger.model.js";

// Configurable constants for system account reserve and auto-refill
export const SYSTEM_INITIAL_RESERVE = Number(process.env.SYSTEM_INITIAL_RESERVE) || 10_000_000; // Default ₹10,000,000 (1 Crore)
export const SYSTEM_MINIMUM_THRESHOLD = Number(process.env.SYSTEM_MINIMUM_THRESHOLD) || 500_000;  // Default ₹500,000 refill threshold
export const SYSTEM_DEFAULT_REFILL = Number(process.env.SYSTEM_DEFAULT_REFILL) || 10_000_000;    // Default ₹10,000,000 refill amount

/**
 * Seeds a system account with an initial large reserve balance by creating
 * a completed reserve transaction and an associated CREDIT ledger entry.
 *
 * @param {string|mongoose.Types.ObjectId} accountId - The system account ID
 * @param {number} [amount=SYSTEM_INITIAL_RESERVE] - The amount to credit
 * @param {mongoose.ClientSession|null} [externalSession=null] - Optional MongoDB session
 * @returns {Promise<{ transaction: object, ledger: object }>}
 */
export const seedSystemAccountBalance = async (accountId, amount = SYSTEM_INITIAL_RESERVE, externalSession = null) => {
    const session = externalSession || await mongoose.startSession();
    const isLocalSession = !externalSession;
    if (isLocalSession) {
        session.startTransaction();
    }

    try {
        const idempotencyKey = `SYSTEM_RESERVE_SEED_${accountId}_${crypto.randomUUID()}`;

        const [transaction] = await transactionModel.create([{
            fromAccount: accountId,
            toAccount: accountId,
            amount: Number(amount),
            status: "COMPLETED",
            idempotencyKey
        }], { session });

        const [ledger] = await ledgerModel.create([{
            account: accountId,
            amount: Number(amount),
            transaction: transaction._id,
            type: "CREDIT"
        }], { session });

        if (isLocalSession) {
            await session.commitTransaction();
        }

        return { transaction, ledger };
    } catch (error) {
        if (isLocalSession) {
            try { await session.abortTransaction(); } catch (_) {}
        }
        throw error;
    } finally {
        if (isLocalSession) {
            session.endSession();
        }
    }
};

/**
 * Checks system account balance and automatically refills it if:
 * 1. Balance is negative or zero.
 * 2. Balance is below the minimum threshold.
 * 3. Balance is insufficient for an upcoming requested amount.
 *
 * @param {object} systemAccount - The Mongoose account document
 * @param {number} [requiredAmount=0] - The amount needed for an upcoming operation
 * @returns {Promise<{ refilled: boolean, currentBalance: number, refilledAmount: number }>}
 */
export const ensureSystemAccountSufficientBalance = async (systemAccount, requiredAmount = 0) => {
    if (!systemAccount) {
        throw new Error("System account is required to verify reserve balance.");
    }

    let currentBalance = await systemAccount.getBalance();
    const neededAmount = Number(requiredAmount) || 0;

    // Trigger auto-refill if:
    // - Current balance cannot cover the needed amount
    // - OR current balance is below the minimum reserve threshold
    // - OR current balance is 0 or negative
    const isInsufficient = (currentBalance < neededAmount) || 
                           (currentBalance < SYSTEM_MINIMUM_THRESHOLD) || 
                           (currentBalance <= 0);

    if (!isInsufficient) {
        return {
            refilled: false,
            currentBalance,
            refilledAmount: 0
        };
    }

    // Calculate refill amount: ensure it covers any negative balance + needed amount + safety buffer
    const deficit = neededAmount > currentBalance 
        ? (neededAmount - currentBalance) 
        : (currentBalance < 0 ? Math.abs(currentBalance) : 0);

    const refillAmount = Math.max(SYSTEM_DEFAULT_REFILL, deficit + SYSTEM_DEFAULT_REFILL);

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const idempotencyKey = `SYSTEM_AUTO_REFILL_${systemAccount._id}_${Date.now()}_${crypto.randomUUID()}`;

        const [transaction] = await transactionModel.create([{
            fromAccount: systemAccount._id,
            toAccount: systemAccount._id,
            amount: refillAmount,
            status: "COMPLETED",
            idempotencyKey
        }], { session });

        await ledgerModel.create([{
            account: systemAccount._id,
            amount: refillAmount,
            transaction: transaction._id,
            type: "CREDIT"
        }], { session });

        await session.commitTransaction();
    } catch (error) {
        try { await session.abortTransaction(); } catch (_) {}
        throw new Error(`Failed to automatically refill system account reserve: ${error.message}`);
    } finally {
        session.endSession();
    }

    // Refresh balance after refill
    currentBalance = await systemAccount.getBalance();

    return {
        refilled: true,
        currentBalance,
        refilledAmount: refillAmount
    };
};

/**
 * Retrieves the system account for a user, or automatically creates and seeds one
 * if it doesn't already exist. If an existing account has insufficient/negative balance,
 * it automatically refills it.
 *
 * @param {string|mongoose.Types.ObjectId} userId
 * @returns {Promise<object>} The system account document
 */
export const getOrCreateSystemAccount = async (userId) => {
    let account = await accountModel.findOne({ user: userId });

    if (!account) {
        account = await accountModel.create({ user: userId });
        await seedSystemAccountBalance(account._id);
    } else {
        // Heal existing system account if it has zero/negative or low balance
        await ensureSystemAccountSufficientBalance(account, 0);
    }

    return account;
};
