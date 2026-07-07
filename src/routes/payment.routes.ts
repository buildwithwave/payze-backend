import { Router } from "express";
import { PaymentController } from "../controllers/payment.controller";
import { requireAuth } from "../middlewares/auth.middleware";

const router: Router = Router();

/**
 * @swagger
 * /payments/create:
 *   post:
 *     tags: [Payments]
 *     summary: Create a payment (deprecated)
 *     description: Use /checkout/session instead
 *     deprecated: true
 *     responses:
 *       501:
 *         description: Not implemented — use /checkout/session
 */
router.post("/create", (req, res) => {
  res.status(501).json({ message: "Use /api/checkout/session instead" });
});

/**
 * @swagger
 * /payments/webhook:
 *   post:
 *     tags: [Payments]
 *     summary: Nomba payment webhook
 *     description: Called by Nomba when a payment status changes
 *     responses:
 *       200:
 *         description: Webhook processed
 *       500:
 *         description: Webhook processing error
 */
router.post("/webhook", PaymentController.webhook);

/**
 * @swagger
 * /payments/webhook:
 *   get:
 *     tags: [Payments]
 *     summary: Webhook verification
 *     description: Some services send a GET request to verify the webhook URL exists
 *     responses:
 *       200:
 *         description: Webhook is active
 */
router.get("/webhook", PaymentController.checkoutCallback);

/**
 * @swagger
 * /payments/{id}:
 *   get:
 *     tags: [Payments]
 *     summary: Get a payment by ID
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Payment details
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Payment'
 *       404:
 *         description: Payment not found
 */
router.get("/:id", requireAuth, PaymentController.getPayment);

export default router;
