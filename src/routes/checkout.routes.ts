import { Router } from "express";
import { CheckoutController } from "../controllers/checkout.controller";
import { requireAuth } from "../middlewares/auth.middleware";

const router: Router = Router();

router.use(requireAuth);

router.post("/session", CheckoutController.createSession);

export default router;
