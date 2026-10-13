import transactionModel from "../models/transaction.model.js";
import ledgerModel from "../models/ledger.model.js";
import accountModel from "../models/account.model.js";
import mongoose from "mongoose";
import { sendTransactionEmail } from "../services/email.service.js";

/**
 * Create Transaction
 * 10 steps required to create transaction
 * 1. validate request
 * 2. validate idempotencyKey
 * 3. check account status
 * 4. Derive sender balance from ledger (means kya sendkr ke pass kitna balance ha ke usy send kiya ja saky)
 * 5. create transaction (pending)
 * 6. create debit ledger entry
 * 7. create credit ledger entry
 * 8. Mark transaction completed
 * 9. Commit mongodb session
 * 10. send transaction success email
*/

export const createTransaction = async(req, res)=>{

    // Validate request
    const {fromAccount, toAccount , amount , idempotencyKey} = req.body;
    if(!fromAccount || !toAccount || !amount || !idempotencyKey){
        return res.status(400).json({message: "All fields are required."})
    }

    // Edge Case: DB lookups wrapped in try-catch in case of unexpected DB errors
    let fromAccountUser, toAccountUser;
    try {
        fromAccountUser = await accountModel.findOne({_id: fromAccount})
        toAccountUser   = await accountModel.findOne({_id: toAccount});
    } catch (err) {
        return res.status(500).json({message: "Error fetching account details.", error: err.message})
    }

    console.log("checkpoint 2 & 3")
    if(!toAccountUser || !fromAccountUser){
        return res.status(400).json({message: "Sender or Receiver account is invalid."})
    }

    // Idempotency key validation
    const isIdempotencyKeyExists = await transactionModel.findOne({idempotencyKey})
    if (isIdempotencyKeyExists) {
        if (isIdempotencyKeyExists.status === "COMPLETED") {
            return res.status(200).json({message: "Transaction already completed", transaction: isIdempotencyKeyExists})
        }
        if (isIdempotencyKeyExists.status === "FAILURE") {
            return res.status(409).json({message: "Transaction already failed. Please use a new idempotency key."})
        }
        if(isIdempotencyKeyExists.status === "PENDING"){
            return res.status(202).json({message: "Transaction is already processing."})
        }
        if(isIdempotencyKeyExists.status === "REVERSED"){
            return res.status(409).json({message: "Transaction is already reversed."})
        }
    }

    // Check account status
    if(fromAccountUser.status !== "ACTIVE" || toAccountUser.status !== "ACTIVE"){
        return res.status(400).json({message: "Account is not active."})
    }

    // Derive sender balance from ledger
    const senderBalance = await fromAccountUser.getBalance();
    // BUG FIX: amount from req.body is a string — must compare as Number
    if(senderBalance < Number(amount)){
        return res.status(400).json({message: `Sender has Insufficient Balance, Requested balance is ${amount} but available balance is ${senderBalance}`})
    }

    // Create Transaction inside a DB session (atomic)
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const transaction = await transactionModel.create([{
            fromAccount: fromAccountUser._id,
            toAccount: toAccountUser._id,
            amount,
            idempotencyKey,
            status: "PENDING"
        }], {session})

        // BUG FIX: .create() with a session returns an ARRAY — must access [0]
        const createdTransaction = transaction[0];

        await ledgerModel.create([{
            account: fromAccountUser._id,
            amount,
            transaction: createdTransaction._id,
            type: "DEBIT"
        }], {session})

        await ledgerModel.create([{
            account: toAccountUser._id,
            amount,
            transaction: createdTransaction._id,
            type: "CREDIT"
        }], {session})

        createdTransaction.status = "COMPLETED"
        await createdTransaction.save({session})

        // Commit the transaction
        await session.commitTransaction();

        // Edge Case: Email failure should NOT roll back the transaction
        try {
            await sendTransactionEmail(req.user.email, req.user.name, amount, toAccountUser)
        } catch (emailError) {
            console.error("Transaction email failed (non-critical):", emailError.message)
        }

        return res.status(201).json({message: "Transaction created successfully", transaction: createdTransaction})

    } catch (error) {
        // Abort the session on any DB failure
        await session.abortTransaction();
        console.error("Transaction failed, session aborted:", error.message)
        return res.status(500).json({message: "Transaction failed. Please try again.", error: error.message})
    } finally {
        session.endSession();
    }
}

export const createInitialFundsTransaction = async(req, res)=>{
    const {toAccount , amount , idempotencyKey} = req.body;
    if(!toAccount || !amount || !idempotencyKey){
        return res.status(400).json({message: "All fields are required."})
    }
    const toAccountExist = await accountModel.findById({_id: toAccount})
    if(!toAccountExist){
        return res.status(400).json({message: "Account does not exist."})
    }
    const fromAccountUser = await accountModel.findOne({user: req.user._id})
    if(!fromAccountUser){
        return res.status(400).json({message: "System Account not found."})
    }

    // Now create session

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const transaction = new transactionModel({
            fromAccount: fromAccountUser._id,
            toAccount: toAccountExist._id,
            amount,
            idempotencyKey,
            status: "PENDING"
        })

        const debitLedgerEntry = await ledgerModel.create([{
            account: fromAccountUser._id,
            amount,
            transaction: transaction._id,
            type: "DEBIT"
        }], {session})

        const creditLedgerEntry = await ledgerModel.create([{
            account: toAccountExist._id,
            amount,
            transaction: transaction._id,
            type: "CREDIT"
        }], {session})

        transaction.status = "COMPLETED"
        await transaction.save({session})
        await session.commitTransaction();

        return res.status(201).json({message: "Transaction created successfully", transaction})

    } catch (error) {
        await session.abortTransaction();
        return res.status(500).json({message: "Transaction failed.", error: error.message})
    } finally {
        await session.endSession();
    }
    
}
