import { Router } from "express";
import { AuthController } from "../controllers/auth.controller";
import { requireAuth } from "../middlewares/auth.middleware";

const router: Router = Router();

router.post("/register", AuthController.register);
router.post("/login", AuthController.login);
router.get("/users/me", requireAuth, AuthController.getMe);

export default router;
