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
        min: [1, "Amount must be at least 1."],
        validate: {
            validator: function(val) {
                return typeof val === "number" && !isNaN(val) && val >= 1;
            },
            message: "Amount must be a valid number starting from 1 or greater."
        },
        set: function(val) {
            if (typeof val === "string") {
                const trimmed = val.trim();
                if (trimmed.startsWith("0") || !/^[1-9]\d*(\.\d+)?$/.test(trimmed)) {
                    throw new Error("Amount must start with 1 or greater and cannot start with 0.");
                }
            } else if (typeof val === "number") {
                if (isNaN(val) || val < 1) {
                    throw new Error("Amount must be at least 1.");
                }
            }
            return val;
        }
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
