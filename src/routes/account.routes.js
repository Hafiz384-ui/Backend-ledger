import express from 'express';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { createAccountController, getAccountController, getUserAccountBalance } from '../controllers/account.controller.js';
const router = express.Router();

/**
 * Post method /api/account
 * This is used for create account
 */ 

router.post('/', authMiddleware, createAccountController)

/**
 * Get method /api/account/my-accounts
 * This is used for fetching all accounts of logged in user
 */ 

router.get('/my-accounts', authMiddleware, getAccountController)

/**
 *  Get method /api/account/balance/:id
 *  This api is used to get user balance
 * */ 

router.get('/balance/:accountId', authMiddleware, getUserAccountBalance)

export default router;