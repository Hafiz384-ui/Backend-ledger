import express from "express";
import { authMiddleware, authSystemUserMiddleware } from "../middleware/auth.middleware.js";
import { createInitialFundsTransaction, createTransaction } from "../controllers/transaction.controller.js";

const router = express.Router();


/*
*Post api/transactions
* Create Transaction
*/ 
router.post('/', authMiddleware, createTransaction)


/**
 * Post /api/transactions/system/initial-funds
 * create initail funds transactions from system users
*/
router.post('/system/initial-funds', authSystemUserMiddleware, createInitialFundsTransaction)

export default router