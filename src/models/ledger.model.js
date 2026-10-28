import mongoose from "mongoose";

const ledgerSchema = new mongoose.Schema({
    account:{
        type: mongoose.Schema.Types.ObjectId,
        ref: "account",
        required: [true, "Ledger must be associated with an account."],
        index: true,
        immutable: true // is ka mean ke jo bahi ledger create ho gya ha us ko na to update kr sakta han or na hi delete kr sakta han
    },
    amount:{
        type: Number,
        required: [true, "Amount is required for creating ledger."],
        immutable: true,
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
    transaction: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "transaction",
        required: [true, "Ledger must be associated with a transaction."],
        immutable: true,
        index: true
    },
    type:{
        type: String,
        enum: {
            values: ["CREDIT","DEBIT"]
        },
        required: [true, "Type is required for creating ledger."],
        immutable: true,
    }
},{
    timestamps:true
})

function preventLedgerModification(){
    throw new Error("Ledger are immutable! Cannot be updated or deleted.")
}

ledgerSchema.pre("updateOne", preventLedgerModification)
ledgerSchema.pre("findOneAndUpdate", preventLedgerModification)
ledgerSchema.pre("replaceOne", preventLedgerModification)
ledgerSchema.pre("updateOne", preventLedgerModification)
ledgerSchema.pre("remove", preventLedgerModification)
ledgerSchema.pre("findOneAndDelete", preventLedgerModification)
ledgerSchema.pre("findOneAndReplace", preventLedgerModification)
ledgerSchema.pre("deleteMany", preventLedgerModification)
ledgerSchema.pre("deleteOne", preventLedgerModification)

const ledgerModel = mongoose.model("ledger", ledgerSchema);

export default ledgerModel;
