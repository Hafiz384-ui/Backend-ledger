import express from "express";
import { loginUser, registerUser } from "../controllers/auth.controller.js";
import authMiddleware from "../middleware/auth.middleware.js";

const router = express.Router();


router.post("/register", registerUser);
router.post("/login", loginUser);

router.get('/testing', authMiddleware, (req, res) => {
    res.send("User authenticated successfully");
})

export default router;