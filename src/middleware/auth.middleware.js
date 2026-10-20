import userModel from "../models/user.model.js";
import jwt from "jsonwebtoken";
import TokenBlacklist from "../models/blackList.model.js";

export const authMiddleware = async(req,res,next) =>{
    const token = req.cookies.token ||  req.headers.authorization?.split(' ')[1]

    if(!token){
        return res.status(401).json({message: "Unauthorized"})
    }
    const isTokenBlacklisted = await TokenBlacklist.findOne({token})
    if(isTokenBlacklisted){
        return res.status(401).json({message: "Unauthorized"})
    }
    try{
        const decodedToken = jwt.verify(token, process.env.JWT_SECRET)        
        const user = await userModel.findById(decodedToken.id).select("+systemUser");
        req.user = user
        return next()
        
    }catch(error){
        return res.status(401).json({message: "unauthorized"})
    }
}


export const authSystemUserMiddleware = async (req, res, next) => {
    const token = req.cookies.token || req.headers.authorization?.split(" ")[1]
    if(!token){
        return res.status(401).json({message: "Unauthorized"})
    }

    const isTokenBlacklisted = await TokenBlacklist.findOne({token})
    if(isTokenBlacklisted){
        return res.status(401).json({message: "Unauthorized"})
    }
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET)
        const systemUser = await userModel.findById(decoded.id).select("+systemUser")
        if(!systemUser || !systemUser.systemUser){
            return res.status(403).json({message: "Access Denied"})
        }
        req.user = systemUser
        return next()
    } catch (error) {
        return res.status(401).json({message: "Unauthorized"})
    }
}