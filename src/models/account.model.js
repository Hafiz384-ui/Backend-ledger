import mongoose from "mongoose";
import ledgerModel from "./ledger.model.js";

const accountSchema = new mongoose.Schema({
    user:{
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: [true, "Account must be associated with user."],
        index: true // Concept => mongodb me jo indexing use hoti ha us ke behind the seen working me B+ tree concept use hota ha us ko bhi lazmi dekhna ha
    },
    status: {
        type: String,
        enum: {
            values: ["ACTIVE", "FROZEN", "CLOSED"],
            message: "Status can either Active, Frozen or Closed",
        },  
        default: "ACTIVE",
    },
    currency: {
        type: String,
        required: [true, "Currency is required for creating an account."],
        default: "INR",
    },
},{timestamps:true})

// Yaha pr compound index create kiya gya ha
accountSchema.index({user:1, status:1});

// Hard enforcement: System user can only create one account
accountSchema.pre("save", async function () {
    if (this.isNew) {
        const userId = this.user?._id || this.user;
        const user = await mongoose.model("user").findById(userId).select("+systemUser");
        if (user?.systemUser) {
            const existingAccount = await mongoose.model("account").findOne({ user: userId });
            if (existingAccount) {
                throw new Error("System user can only create one account. System account already exists.");
            }
        }
    }
});

// aggregation pipeline for ledger balance

accountSchema.methods.getBalance = async function(){
    const balanceData = await ledgerModel.aggregate([
        {$match: {account: this._id}},
        {
            $group: {
                _id: null,
                totalDebit: {
                    $sum: {
                        $cond:[
                            {$eq: ["$type", "DEBIT"]},
                            "$amount",
                            0
                        ]
                    }
                },
                totalCredit: {
                    $sum: {
                        $cond:[
                            {$eq: ["$type", "CREDIT"]},
                            "$amount",
                            0
                        ]
                    }
                }
            }
        },
        {
            $project: {
                _id: 0,
                balance: {
                    $subtract: ["$totalCredit", "$totalDebit"]
                }
            } 
        },
    ])

    // Handle no transaction found case
    if(balanceData.length === 0){
        return 0;
    }
    return balanceData[0].balance;
}

const accountModel = mongoose.model("account", accountSchema)

export default accountModel;