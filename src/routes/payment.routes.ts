import { Router } from "express";
import { PaymentController } from "../controllers/payment.controller";
import { requireAuth } from "../middlewares/auth.middleware";

const router: Router = Router();

router.post("/create", (req, res) => {
  // Normally integrated with checkout, but exists here per requirements if needed standalone
  res.status(501).json({ message: "Use /api/checkout/session instead" });
});

router.post("/webhook", PaymentController.webhook);

router.get("/:id", requireAuth, PaymentController.getPayment);

export default router;
