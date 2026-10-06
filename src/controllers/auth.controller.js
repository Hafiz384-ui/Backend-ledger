
import User from "../models/user.model.js";
import generateToken from "../utils/generateToken.js";
import bcrypt from "bcryptjs";
import sendRegistrationEmail from "../services/email.service.js";

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
        res.cookie("token", token)

        res.status(201).json({ message: "User created successfully", user, token });
        await sendRegistrationEmail(user.email, user.username)
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
        if(!user){
            return res.status(404).json({message: "Invalid email or password"});
        }       
        const isPasswordCorrect = bcrypt.compare(password, user.password);
        // const isPasswordCorrect = user.comparePassword(password);
        if(!isPasswordCorrect){
            return res.status(401).json({message: "Invalid email or password"});
        }
        const token = generateToken({ id: user._id, email: user.email});
        res.cookie("token", token);
        return res.status(200).json({message: "User logged in successfully", user, token});
    } catch (error) {
        return res.status(500).json({message: error.message});
    }
}