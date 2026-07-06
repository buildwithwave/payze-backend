import { Request, Response } from "express";
import { WhatsAppCheckoutService } from "../services/whatsapp-checkout.service";

export class WhatsAppCheckoutController {
  /**
   * Twilio webhook for incoming WhatsApp messages.
   * Twilio sends form-urlencoded data with fields like Body, From, To, etc.
   */
  static async incoming(req: Request, res: Response): Promise<void> {
    try {
      const { Body, From } = req.body;
      const numMedia = parseInt(req.body.NumMedia || "0", 10);

      // If there's no From address, or no body AND no media, ignore it
      if (!From || (typeof Body !== "string" && numMedia === 0)) {
        console.warn("[WhatsApp] Missing From, or both Body and Media in incoming webhook");
        res.status(200).send("<Response></Response>");
        return;
      }

      const textBody = Body || "";

      // Strip "whatsapp:" prefix to normalize, then pass raw phone
      const phone = From.replace("whatsapp:", "");

      // Extract media URLs (Twilio passes NumMedia, MediaUrl0, MediaUrl1...)
      const mediaUrls: string[] = [];
      for (let i = 0; i < numMedia; i++) {
        if (req.body[`MediaUrl${i}`]) {
          mediaUrls.push(req.body[`MediaUrl${i}`]);
        }
      }

      console.log(`[WhatsApp] Incoming from ${phone}: "${textBody}" with ${mediaUrls.length} media item(s)`);

      // Process asynchronously — respond to Twilio immediately
      // so we don't hit their 15-second timeout
      WhatsAppCheckoutService.handleIncomingMessage(phone, textBody, mediaUrls).catch(
        (err) => {
          console.error("[WhatsApp] Error handling message:", err);
        },
      );

      // Empty TwiML response — we send replies via REST API, not inline
      res.status(200).type("text/xml").send("<Response></Response>");
    } catch (err) {
      console.error("[WhatsApp] Webhook error:", err);
      res.status(200).type("text/xml").send("<Response></Response>");
    }
  }
}
