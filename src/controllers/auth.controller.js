import User from "../models/user.model.js";
import generateToken from "../utils/generateToken.js";
import bcrypt from "bcryptjs";
import sendRegistrationEmail from "../services/email.service.js";
import TokenBlacklistModel from "../models/blackList.model.js";
import { createAuditLog } from "../utils/logger.js";
import jwt from "jsonwebtoken";

export const registerUser = async (req, res) => {
    try {
        // Explicitly strip any systemUser parameter to prevent privilege escalation
        delete req.body.systemUser;

        const { username, email, password } = req.body;
        if ([username, email, password].some((field) => !field || field?.trim() === "")) {
            return res.status(400).json({ message: "All fields are required" });
        }

        const isUserExist = await User.findOne({ email });
        if (isUserExist) {
            return res.status(400).json({ message: "User already exist" });
        }

        // Hardcode systemUser: false to ensure public registration never creates admin users
        const user = await User.create({
            username: username.trim(),
            email: email.trim().toLowerCase(),
            password,
            systemUser: false
        });

        const token = generateToken({ id: user._id, email: user.email });
        res.cookie("token", token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            maxAge: 7 * 24 * 60 * 60 * 1000
        });

        // Record immutable audit log for registration
        await createAuditLog({
            userId: user._id,
            action: "USER_REGISTERED",
            targetResource: "user",
            resourceId: user._id,
            details: {
                username: user.username,
                email: user.email
            },
            req
        });

        res.status(201).json({ message: "User created successfully", user, token });

        try {
            await sendRegistrationEmail(user.email, user.username);
        } catch (emailErr) {
            console.warn("Registration email delivery warning:", emailErr?.message || emailErr);
        }
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};

export const loginUser = async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ message: "All fields are required" });
        }

        const user = await User.findOne({ email }).select("+password +systemUser");
        if (!user) {
            return res.status(404).json({ message: "Invalid email or password" });
        }

        const isPasswordCorrect = await bcrypt.compare(password, user.password);
        if (!isPasswordCorrect) {
            return res.status(401).json({ message: "Invalid email or password" });
        }

        const token = generateToken({ id: user._id, email: user.email });
        res.cookie("token", token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            maxAge: 7 * 24 * 60 * 60 * 1000
        });

        // Record immutable audit log for login
        await createAuditLog({
            userId: user._id,
            action: "USER_LOGIN",
            targetResource: "user",
            resourceId: user._id,
            details: {
                email: user.email,
                systemUser: Boolean(user.systemUser)
            },
            req
        });

        return res.status(200).json({ message: "User logged in successfully", user, token });
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};

export const logoutUser = async (req, res) => {
    try {
        const token = req.cookies.token || req.headers.authorization?.split(" ")[1];
        if (!token) {
            return res.status(401).json({ message: "Unauthorized" });
        }

        let userId = req.user?._id;
        if (!userId) {
            try {
                const decoded = jwt.verify(token, process.env.JWT_SECRET);
                userId = decoded?.id;
            } catch (_) {}
        }

        res.clearCookie("token");
        await TokenBlacklistModel.create({
            token: token
        });

        if (userId) {
            // Record immutable audit log for logout
            await createAuditLog({
                userId,
                action: "USER_LOGOUT",
                targetResource: "user",
                resourceId: userId,
                details: {
                    event: "User logged out session invalidated"
                },
                req
            });
        }

        res.status(200).json({
            message: "User logged out successfully"
        });
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};