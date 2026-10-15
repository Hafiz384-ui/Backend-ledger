
import User from "../models/user.model.js";
import generateToken from "../utils/generateToken.js";
import bcrypt from "bcryptjs";
import sendRegistrationEmail from "../services/email.service.js";
import TokenBlacklistModel from "../models/blackList.model.js";

export const registerUser = async (req, res) => {
    try {
        const { username, email, password } = req.body;
        if ([username, email, password].some((field) => !field || field?.trim() === "")) {
            return res.status(400).json({ message: "All fields are required" });
        }
        const isUserExist = await User.findOne({ email });
        if (isUserExist) {
            return res.status(400).json({ message: "User already exist" });
        }
        const user = await User.create({
            username,
            email,
            password
        })

        const token = generateToken({ id: user._id, email: user.email })
        res.cookie("token", token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            maxAge: 7 * 24 * 60 * 60 * 1000
        });

        // const userResponse = user.toObject();
        // delete userResponse.password;
        // userResponse.systemUser = Boolean(userResponse.systemUser);

        res.status(201).json({ message: "User created successfully", user: user, token });
        try {
            await sendRegistrationEmail(user.email, user.username);
        } catch (emailErr) {
            console.warn("Registration email delivery warning:", emailErr?.message || emailErr);
        }
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
}

export const loginUser = async (req, res) => {
    try {
        const {email, password} = req.body;
        if(!email || !password){
            return res.status(400).json({message: "All fields are required"});
        }
        const user = await User.findOne({email}).select("+password");
        // console.log(user);
        if(!user){
            return res.status(404).json({message: "Invalid email or password"});
        }       
        const isPasswordCorrect = await bcrypt.compare(password, user.password);
        if(!isPasswordCorrect){
            return res.status(401).json({message: "Invalid email or password"});
        }
        const token = generateToken({ id: user._id, email: user.email});
        res.cookie("token", token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            maxAge: 7 * 24 * 60 * 60 * 1000
        });

        // const userResponse = user.toObject();
        // delete userResponse.password;
        // userResponse.systemUser = Boolean(userResponse.systemUser);

        return res.status(200).json({message: "User logged in successfully", user: user, token});
    } catch (error) {
        return res.status(500).json({message: error.message});
    }
}


export const logoutUser = async (req, res)=>{
    try {
        const token = req.cookies.token || req.headers.authorization?.split(" ")[1]
        if(!token){
            return res.status(401).json({message: "Unauthorized"});
        }

        res.clearCookie("token")
        await TokenBlacklistModel.create({
            token: token
        })

        res.status(200).json({
            message: "User logged out successfully"
        });
        
    } catch (error) {
        return res.status(500).json({message: error.message});
    }
}