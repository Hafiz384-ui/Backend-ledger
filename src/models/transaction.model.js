import mongoose from 'mongoose';


const transactionSchema = new mongoose.Schema({
    fromAccount: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "account",
        required: [true, "Transaction must be associated with a from account."],
        index: true
    },
    toAccount: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "account",
        required: [true, "Transaction must be associated with a to account."],
        index: true
    },
    status:{
        type: String,
        enum: {
            values: ["PENDING", "COMPLETED", "FAILURE", "REVERSED"],
            message: "Status can either PENDING, COMPLETED, FAILURE or REVERSED."
        },
        default: "PENDING",
    },
    amount: {
        type: Number,
        required: [true, "Amount is required for transaction."],
        min: [1, "Amount must be at least 1."]
    },
    idempotencyKey: {
        type: String,
        required: [true, "Idempotency key is required for transaction."],
        unique: true,
        index: true
    }
},{timestamps: true})

const transactionModel = mongoose.model("transaction", transactionSchema)

export default transactionModel;