import userModel from "../models/user.model.js";
import jwt from "jsonwebtoken";

async function authMiddleware(req,res,next){
    const token = req.cookies.token ||  req.headers.authorization?.split(' ')[1]

    if(!token){
        return res.status(401).json({message: "Unauthorized"})
    }
    try{
        const decodedToken = jwt.verify(token, process.env.JWT_SECRET)        
        const user = await userModel.findById(decodedToken.id)
        req.user = user
        return next()
        
    }catch(error){
        return res.status(401).json({message: "unauthorized"})
    }
}

export default authMiddleware;