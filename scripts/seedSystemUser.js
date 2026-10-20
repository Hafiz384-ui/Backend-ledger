import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import mongoose from "mongoose";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, "../.env") });
if (!process.env.MONGODB_URI) {
    dotenv.config({ path: path.resolve(__dirname, "../../.env") });
}

import User from "../src/models/user.model.js";
import accountModel from "../src/models/account.model.js";
import transactionModel from "../src/models/transaction.model.js";
import ledgerModel from "../src/models/ledger.model.js";
import AuditLog from "../src/models/AuditLog.model.js";
import { getSystemServerIp } from "../src/utils/logger.js";

const GENESIS_CREDIT_AMOUNT = 10_000_000_000; // 10 Arab (10 Billion INR)
const CURRENCY = "INR";
const SYSTEM_ADMIN_EMAIL = process.env.SYSTEM_USER_EMAIL || "system.admin@bank.internal";
const SYSTEM_ADMIN_USERNAME = process.env.SYSTEM_USER_USERNAME || "SystemAdministrator";
const SYSTEM_ADMIN_PASSWORD = process.env.SYSTEM_USER_PASSWORD || "SystemAdmin#Bank2026!";
const SYSTEM_IP = getSystemServerIp();

async function seedSystemUser() {
    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri) {
        console.error("[SEED ERROR] MONGODB_URI not found in environment.");
        process.exit(1);
    }

    try {
        console.log("[SEED] Connecting to database...");
        await mongoose.connect(mongoUri);
        console.log("[SEED] Database connected.");

        // Step 1: Check if System User already exists
        const existingSystemUser = await User.findOne({ systemUser: true }).select("+systemUser");

        if (existingSystemUser) {
            console.log(`[SEED] System User found: ${existingSystemUser.email} (${existingSystemUser._id})`);

            let systemAccount = await accountModel.findOne({ user: existingSystemUser._id });

            if (!systemAccount) {
                console.log("[SEED] Creating missing account for System User...");
                systemAccount = await accountModel.create({
                    user: existingSystemUser._id
                });
                console.log(`[SEED] Linked account created: ${systemAccount._id}`);
            }

            if (systemAccount.status !== "ACTIVE") {
                systemAccount.status = "ACTIVE";
                await systemAccount.save();
                console.log("[SEED] Account status reactivated to ACTIVE.");
            }

            const currentBalance = await systemAccount.getBalance();
            console.log(`[SEED] Current Ledger Balance: ₹${currentBalance.toLocaleString("en-IN")}`);

            // Idempotent: If balance is already sufficient, exit cleanly
            if (currentBalance >= GENESIS_CREDIT_AMOUNT) {
                console.log("[SEED STATUS] Already seeded. Balance is valid and positive. Exiting.");
                await mongoose.disconnect();
                process.exit(0);
            }

            // Refill Genesis Reserve Balance if deficient
            console.log(`[SEED] Refilling Genesis funds: ₹${GENESIS_CREDIT_AMOUNT.toLocaleString("en-IN")}...`);
            const session = await mongoose.startSession();
            session.startTransaction();

            try {
                const idempotencyKey = `GENESIS_SYSTEM_RESERVE_${systemAccount._id}_${Date.now()}`;

                const [genesisTx] = await transactionModel.create(
                    [
                        {
                            fromAccount: systemAccount._id,
                            toAccount: systemAccount._id,
                            amount: GENESIS_CREDIT_AMOUNT,
                            status: "COMPLETED",
                            idempotencyKey
                        }
                    ],
                    { session }
                );

                await ledgerModel.create(
                    [
                        {
                            account: systemAccount._id,
                            amount: GENESIS_CREDIT_AMOUNT,
                            transaction: genesisTx._id,
                            type: "CREDIT"
                        }
                    ],
                    { session }
                );

                await AuditLog.create(
                    [
                        {
                            user: existingSystemUser._id,
                            action: "SYSTEM_INITIAL_FUNDS",
                            targetResource: "account",
                            resourceId: systemAccount._id,
                            details: {
                                reason: "Genesis System Liquidity Reserve Injection",
                                amount: GENESIS_CREDIT_AMOUNT,
                                currency: CURRENCY,
                                transactionId: genesisTx._id
                            },
                            ipAddress: SYSTEM_IP
                        }
                    ],
                    { session }
                );

                await session.commitTransaction();
                session.endSession();

                const newBalance = await systemAccount.getBalance();
                console.log(`[SEED SUCCESS] Funds injected. Updated Balance: ₹${newBalance.toLocaleString("en-IN")}`);
            } catch (err) {
                await session.abortTransaction();
                session.endSession();
                throw err;
            }

            await mongoose.disconnect();
            process.exit(0);
        }

        // Step 2: Fresh Database — Atomic Creation Flow
        console.log("[SEED] No System User found. Creating initial System User & Reserve...");
        const session = await mongoose.startSession();
        session.startTransaction();

        try {
            const [systemUser] = await User.create(
                [
                    {
                        username: SYSTEM_ADMIN_USERNAME,
                        email: SYSTEM_ADMIN_EMAIL,
                        password: SYSTEM_ADMIN_PASSWORD,
                        systemUser: true
                    }
                ],
                { session }
            );
            console.log(`[SEED] System User created: ${systemUser.email}`);

            const [systemAccount] = await accountModel.create(
                [
                    {
                        user: systemUser._id
                    }
                ],
                { session }
            );
            console.log(`[SEED] Linked account created: ${systemAccount._id}`);

            const genesisIdempotencyKey = `GENESIS_SYSTEM_RESERVE_INITIAL_FUNDS_${systemAccount._id}`;
            const [genesisTx] = await transactionModel.create(
                [
                    {
                        fromAccount: systemAccount._id,
                        toAccount: systemAccount._id,
                        amount: GENESIS_CREDIT_AMOUNT,
                        status: "COMPLETED",
                        idempotencyKey: genesisIdempotencyKey
                    }
                ],
                { session }
            );

            await ledgerModel.create(
                [
                    {
                        account: systemAccount._id,
                        amount: GENESIS_CREDIT_AMOUNT,
                        transaction: genesisTx._id,
                        type: "CREDIT"
                    }
                ],
                { session }
            );

            await AuditLog.create(
                [
                    {
                        user: systemUser._id,
                        action: "SYSTEM_INITIAL_FUNDS",
                        targetResource: "account",
                        resourceId: systemAccount._id,
                        details: {
                            description: "Genesis Central Bank Reserve Liquidity Initialization (10 Arab INR)",
                            amount: GENESIS_CREDIT_AMOUNT,
                            currency: CURRENCY,
                            transactionId: genesisTx._id
                        },
                        ipAddress: SYSTEM_IP
                    }
                ],
                { session }
            );

            await session.commitTransaction();
            session.endSession();

            const verifiedBalance = await systemAccount.getBalance();
            console.log(`[SEED SUCCESS] System User initialized. Reserve Balance: ₹${verifiedBalance.toLocaleString("en-IN")} ${CURRENCY}`);
        } catch (error) {
            await session.abortTransaction();
            session.endSession();
            throw error;
        }

        await mongoose.disconnect();
        console.log("[SEED] Disconnected cleanly.");
        process.exit(0);
    } catch (error) {
        console.error("[SEED FAILED]", error.message);
        try {
            await mongoose.disconnect();
        } catch (_) {}
        process.exit(1);
    }
}

seedSystemUser();
