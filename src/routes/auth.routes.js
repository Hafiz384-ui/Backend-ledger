import express from "express";
import { loginUser, registerUser, logoutUser } from "../controllers/auth.controller.js";

const router = express.Router();


router.post("/register", registerUser);
router.post("/login", loginUser);
router.post("/logout", logoutUser);

// router.get('/testing', authMiddleware, (req, res) => {
//     res.send("User authenticated successfully");
// })

export default router;