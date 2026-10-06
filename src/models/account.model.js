import mongoose from "mongoose";

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
        requried: [true, "Currency is required for creating an account."],
        default: "INR",
    },
},{timestamps:true})

// Yaha pr compound index create kiya gya ha
accountSchema.index({user:1, status:1});

const accountModel = mongoose.model("account", accountSchema)

export default accountModel;