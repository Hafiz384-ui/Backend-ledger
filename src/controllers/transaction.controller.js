import transactionModel from "../models/transaction.model.js";
import ledgerModel from "../models/ledger.model.js";
import accountModel from "../models/account.model.js";
import mongoose from "mongoose";
import { sendTransactionEmail } from "../services/email.service.js";
import { ensureSystemAccountSufficientBalance, getOrCreateSystemAccount } from "../services/systemAccount.service.js";
import { createAuditLog } from "../utils/logger.js";

/**
 * === createTransaction ===
 * Ye function ek naya transaction create karta hai.
 * Poora process 10 steps mein hota hai:
 *
 * 1. Request validate karo (sab fields aaye hain ya nahi)
 * 2. Accounts DB se fetch karo (sender aur receiver dono)
 * 3. Idempotency key check karo (same request dobara to nahi aayi)
 * 4. Account status check karo (dono accounts ACTIVE hain ya nahi)
 * 5. Sender ka balance check karo (itna balance hai ke nahi)
 * 6. MongoDB session shuru karo (atomic transaction ke liye)
 * 7. Transaction document "PENDING" status ke saath banao
 * 8. Sender ka DEBIT ledger entry banao
 * 9. Receiver ka CREDIT ledger entry banao
 * 10. Transaction ko "COMPLETED" mark karo, session commit karo, email bhejo
 */

export const createTransaction = async(req, res)=>{

    // === Enforce System User / Admin Restriction ===
    // Admin/System users can ONLY seed initial funds via POST /api/transactions/system/initial-funds.
    // They are not allowed to send money through simple/standard transfers.
    if (req.user?.systemUser) {
        return res.status(403).json({
            message: "System users (Admins) are not allowed to perform standard transfers. Only initial funds seeding is permitted."
        });
    }

    // === STEP 1: Request Validation ===
    const {fromAccount, toAccount , amount , idempotencyKey} = req.body;
    if(!fromAccount || !toAccount || !amount || !idempotencyKey){
        return res.status(400).json({message: "All fields are required."})
    }

    // === STEP 2: Accounts DB se Fetch karo ===
    let fromAccountUser, toAccountUser;
    try {
        fromAccountUser = await accountModel.findOne({_id: fromAccount})
        toAccountUser   = await accountModel.findOne({_id: toAccount});
    } catch (err) {
        return res.status(500).json({message: "Error fetching account details.", error: err.message})
    }

    if(!toAccountUser || !fromAccountUser){
        return res.status(400).json({message: "Sender or Receiver account is invalid."})
    }

    // Ensure sender account does not belong to a system user
    const fromUserDoc = await mongoose.model("user").findById(fromAccountUser.user).select("+systemUser");
    if (fromUserDoc?.systemUser) {
        return res.status(403).json({
            message: "Transfers from system reserve accounts are restricted. Only initial funds seeding is permitted."
        });
    }

    // === STEP 3: Idempotency Key Check ===
    // Ye check karta hai ke same request pehle se aayi thi ya nahi
    // NOTE: Ye sirf ek pre-check hai. Asli protection MongoDB ki unique index se aati hai
    // aur neeche catch block mein error code 11000 aur 112 ke handlers se.
    const isIdempotencyKeyExists = await transactionModel.findOne({idempotencyKey})
    if (isIdempotencyKeyExists) {

        // Agar transaction pehle complete ho chuki hai
        if (isIdempotencyKeyExists.status === "COMPLETED") {
            return res.status(200).json({message: "Transaction already completed", transaction: isIdempotencyKeyExists})
        }
        // Agar transaction pehle fail ho chuki hai — naya key use karo
        if (isIdempotencyKeyExists.status === "FAILURE") {
            return res.status(409).json({message: "Transaction already failed. Please use a new idempotency key."})
        }
        // Agar transaction abhi bhi process ho rahi hai (PENDING)
        if(isIdempotencyKeyExists.status === "PENDING"){
            return res.status(202).json({message: "Transaction is already processing."})
        }
        // Agar transaction reverse ho chuki hai
        if(isIdempotencyKeyExists.status === "REVERSED"){
            return res.status(409).json({message: "Transaction is already reversed."})
        }
    }

    // === STEP 4: Account Status Check ===
    // Dono accounts ka status "ACTIVE" hona chahiye
    // Agar koi bhi account inactive ya blocked ho to transaction hone nahi denge
    if(fromAccountUser.status !== "ACTIVE" || toAccountUser.status !== "ACTIVE"){
        return res.status(400).json({message: "Account is not active."})
    }

    // === STEP 5: Sender Balance Check ===
    // If sender is a system user and balance is insufficient, auto-refill reserve
    if (req.user?.systemUser) {
        await ensureSystemAccountSufficientBalance(fromAccountUser, Number(amount));
    }

    // Sender ke ledger se uska current balance calculate karo
    // Agar sender ke paas itna paisa nahi to transaction band karo
    const senderBalance = await fromAccountUser.getBalance();
    if(senderBalance < Number(amount)){
        return res.status(400).json({message: `Sender has Insufficient Balance, Requested balance is ${amount} but available balance is ${senderBalance}`})
    }

    // === STEP 6: MongoDB Session Shuru Karo ===
    // Ab hum atomic transaction shuru karte hain
    // Matlab: ya to sab kuch hoga, ya kuch bhi nahi hoga (all-or-nothing)
    const session = await mongoose.startSession();
    session.startTransaction();

    try {

        // === STEP 7: Transaction Record Banao (PENDING) ===
        // Pehle transaction ko "PENDING" status ke saath save karo
        // .create() session ke saath array return karta hai, isliye [0] se pehla element lete hain
        const transaction = await transactionModel.create([{
            fromAccount: fromAccountUser._id,
            toAccount: toAccountUser._id,
            amount,
            idempotencyKey,
            status: "PENDING"
        }], {session})

        const createdTransaction = transaction[0];

        // === STEP 8: Sender ka DEBIT Ledger Entry Banao ===
        // Sender ke account se paisa kata — ledger mein DEBIT darj karo
        await ledgerModel.create([{
            account: fromAccountUser._id,
            amount,
            transaction: createdTransaction._id,
            type: "DEBIT"
        }], {session})

        // === STEP 9: Receiver ka CREDIT Ledger Entry Banao ===
        // Receiver ke account mein paisa aaya — ledger mein CREDIT darj karo
        await ledgerModel.create([{
            account: toAccountUser._id,
            amount,
            transaction: createdTransaction._id,
            type: "CREDIT"
        }], {session})

        // === STEP 10: Transaction "COMPLETED" Mark Karo ===
        // Debit aur Credit dono ho gayi — ab transaction ko COMPLETED karo
        // "new: true" se updated document wapas milta hai, purana nahi
        const completedTransaction = await transactionModel.findOneAndUpdate(
            {_id: createdTransaction._id},
            {status: "COMPLETED"},
            {session, new: true}
        )

        // Record immutable audit log for money transfer
        await createAuditLog({
            userId: req.user._id,
            action: "MONEY_TRANSFER",
            targetResource: "transaction",
            resourceId: completedTransaction._id,
            details: {
                fromAccount: fromAccountUser._id,
                toAccount: toAccountUser._id,
                amount,
                idempotencyKey
            },
            req,
            session
        });

        // Session commit karo — ab sab kuch permanently save ho gaya DB mein
        await session.commitTransaction();

        // Email bhejna try karo — agar fail bhi ho to transaction rollback nahi hogi
        // Email ek secondary kaam hai, transaction ki success uski wajah se affect nahi honi chahiye
        try {
            await sendTransactionEmail(req.user.email, req.user.name, amount, toAccountUser)
        } catch (emailError) {
            console.error("Transaction email failed (non-critical):", emailError.message)
        }

        // Sab kuch theek raha — success response bhejo
        return res.status(201).json({message: "Transaction created successfully", transaction: completedTransaction})

    } catch (error) {

        // === Error Handling ===
        // Koi bhi error aaye to session abort karo (sab kuch rollback ho jata hai)
        // Guard: MongoDB khud bhi session abort kar sakta hai (jaise WriteConflict mein)
        // Isliye abortTransaction() ko bhi try-catch mein rakhte hain
        try { await session.abortTransaction(); } catch (_) {}
        console.error("Transaction failed, session aborted:", error.message)

        // --- Error 11000: Duplicate Key ---
        // Do concurrent requests ne ek saath idempotency check pass kar liya
        // MongoDB ki unique index ne doosri insert block kar di
        if (error.code === 11000 && error.keyPattern?.idempotencyKey) {
            return res.status(409).json({message: "Duplicate transaction: this idempotency key is already being processed. Please wait or use a new key."})
        }

        // --- Error 112: WriteConflict ---
        // Do MongoDB sessions ek saath ek hi document pe likhne ki koshish kar rahe the
        // Ye tab hota hai jab ek transaction chal rahi ho (committed nahi) aur doosri request aaye
        // Pre-check findOne uncommitted data nahi dekh sakta, isliye ye slip ho jaata hai
        // WriteConflict khud hi proof hai ke ek transaction already in-process hai
        if (error.code === 112 || error.errorLabels?.includes("TransientTransactionError")) {
            return res.status(202).json({message: "Transaction is already in process. Please wait for it to complete."})
        }

        // Koi aur error — generic 500 server error
        return res.status(500).json({message: "Transaction failed. Please try again.", error: error.message})

    } finally {
        // Session hamesha band karo — chahe success ho ya failure
        session.endSession();
    }
}


/**
 * === createInitialFundsTransaction ===
 * Ye function system account se kisi user ke account mein initial funds transfer karta hai.
 * Ye admin level ka operation hai — iska koi "fromAccount" body mein nahi aata,
 * balke logged-in user (admin/system) ka account automatically use hota hai.
 */

export const createInitialFundsTransaction = async(req, res)=>{
    // Guard: Enforce System User privilege
    if (!req.user || !req.user.systemUser) {
        return res.status(403).json({ message: "Access denied: System User privileges required." });
    }

    // Zaroori fields check karo
    const {toAccount , amount , idempotencyKey} = req.body;
    if(!toAccount || !amount || !idempotencyKey){
        return res.status(400).json({message: "toAccount, amount, and idempotencyKey are required."})
    }

    const numericAmount = Number(amount);
    if(isNaN(numericAmount) || numericAmount <= 0){
        return res.status(400).json({message: "Amount must be a positive number."})
    }

    // Idempotency pre-check
    const isIdempotencyKeyExists = await transactionModel.findOne({ idempotencyKey });
    if (isIdempotencyKeyExists) {
        if (isIdempotencyKeyExists.status === "COMPLETED") {
            return res.status(200).json({ message: "Transaction already completed", transaction: isIdempotencyKeyExists });
        }
        if (isIdempotencyKeyExists.status === "FAILURE") {
            return res.status(409).json({ message: "Transaction already failed. Please use a new idempotency key." });
        }
        if (isIdempotencyKeyExists.status === "PENDING") {
            return res.status(202).json({ message: "Transaction is already processing." });
        }
    }

    // Receiver ka account dhundho aur status check karo
    const toAccountExist = await accountModel.findById(toAccount);
    if(!toAccountExist){
        return res.status(400).json({message: "Account does not exist."})
    }
    if(toAccountExist.status !== "ACTIVE"){
        return res.status(400).json({message: "Recipient account is not active."})
    }

    // System/Admin ka account dhundho ya auto-create/seed karo (Central Treasury)
    const fromAccountUser = await getOrCreateSystemAccount(req.user._id);

    // Self-transfer check
    if(fromAccountUser._id.equals(toAccountExist._id)){
        return res.status(400).json({message: "Cannot transfer funds from system account to itself."})
    }

    // Ensure system treasury reserve has sufficient balance (auto-refill if low)
    await ensureSystemAccountSufficientBalance(fromAccountUser, numericAmount);

    // Atomic session shuru karo
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        // Pehle transaction object banao (status baad mein COMPLETED karenge)
        const transaction = new transactionModel({
            fromAccount: fromAccountUser._id,
            toAccount: toAccountExist._id,
            amount: numericAmount,
            idempotencyKey,
            status: "PENDING"
        })

        // System account se DEBIT karo
        await ledgerModel.create([{
            account: fromAccountUser._id,
            amount: numericAmount,
            transaction: transaction._id,
            type: "DEBIT"
        }], {session})

        // User account mein CREDIT karo
        await ledgerModel.create([{
            account: toAccountExist._id,
            amount: numericAmount,
            transaction: transaction._id,
            type: "CREDIT"
        }], {session})

        // Transaction status update karo aur DB mein save karo
        transaction.status = "COMPLETED"
        await transaction.save({session})

        // Record immutable audit log for SYSTEM_INITIAL_FUNDS seeding
        await createAuditLog({
            userId: req.user._id,
            action: "SYSTEM_INITIAL_FUNDS",
            targetResource: "account",
            resourceId: toAccountExist._id,
            details: {
                toAccount: toAccountExist._id,
                fromAccount: fromAccountUser._id,
                amount: numericAmount,
                currency: toAccountExist.currency || "INR",
                transactionId: transaction._id,
                idempotencyKey
            },
            req,
            session
        });

        // Sab theek raha — commit karo
        await session.commitTransaction();

        return res.status(201).json({message: "Transaction created successfully", transaction})

    } catch (error) {
        // Koi bhi error aaye to poora rollback
        try { await session.abortTransaction(); } catch (_) {}

        if (error.code === 11000 && error.keyPattern?.idempotencyKey) {
            return res.status(409).json({ message: "Duplicate transaction: this idempotency key is already being processed. Please wait or use a new key." });
        }

        return res.status(500).json({message: "Transaction failed.", error: error.message})
    } finally {
        // Session hamesha close karo
        await session.endSession();
    }
}
