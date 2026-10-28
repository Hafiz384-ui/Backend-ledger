import express from "express";
import { authMiddleware, authSystemUserMiddleware } from "../middleware/auth.middleware.js";
import {
    createInitialFundsTransaction,
    createTransaction,
    getTransactions
} from "../controllers/transaction.controller.js";

const router = express.Router();

/**
 * GET /api/transactions
 * Protected: Authenticated users (customers get their accounts' sent/received, admins get global or system)
 */
router.get("/", authMiddleware, getTransactions);
router.get("/my-transactions", authMiddleware, getTransactions);

/**
 * POST /api/transactions
 * Create Transaction
 */ 
router.post("/", authMiddleware, createTransaction);

/**
 * POST /api/transactions/system/initial-funds
 * Create initial funds transactions from system users (Admin)
 */
router.post("/system/initial-funds", authSystemUserMiddleware, createInitialFundsTransaction);

export default router;
