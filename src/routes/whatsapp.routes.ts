import { Router } from "express";
import { WhatsAppCheckoutController } from "../controllers/whatsapp-checkout.controller";

const router: Router = Router();

/**
 * @swagger
 * /whatsapp/incoming:
 *   post:
 *     tags: [WhatsApp]
 *     summary: Twilio webhook for incoming WhatsApp messages
 *     description: Receives incoming WhatsApp messages from Twilio and processes the self-service checkout flow
 *     requestBody:
 *       content:
 *         application/x-www-form-urlencoded:
 *           schema:
 *             type: object
 *             properties:
 *               Body:
 *                 type: string
 *               From:
 *                 type: string
 *     responses:
 *       200:
 *         description: TwiML response
 */
router.post("/incoming", WhatsAppCheckoutController.incoming);

export default router;
