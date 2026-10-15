import mongoose from "mongoose";

const tokenBlackListSchema = new mongoose.Schema({
    token: {
        type: String,
        required: [true , "Token is required."],
        unique: [true, "Token is already in blacklist"]
    }
}, {timestamps: true});

tokenBlackListSchema.index({createdAt: 1} , {expireAfterSeconds: 24 * 60 * 60});

const TokenBlacklistModel = mongoose.model("TokenBlacklist", tokenBlackListSchema);

export default TokenBlacklistModel;