import transactionModel from "../models/transaction.model.js";
import ledgerModel from "../models/ledger.model.js";
import accountModel from "../models/account.model.js";
import mongoose from "mongoose";

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
