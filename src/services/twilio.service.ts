import twilio from "twilio";
import { env } from "../config/env";

export class TwilioService {
  private static _client: twilio.Twilio | null = null;

  private static get client(): twilio.Twilio {
    if (!this._client) {
      if (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_AUTH_TOKEN) {
        throw new Error("Twilio credentials not configured");
      }
      this._client = twilio(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN);
    }
    return this._client;
  }

  /**
   * Send a WhatsApp message via Twilio.
   * `to` should be in E.164 format (e.g., "+2348012345678").
   * The method prepends "whatsapp:" if not already present.
   */
  static async sendWhatsAppMessage(to: string, body: string): Promise<string> {
    const toNumber = to.startsWith("whatsapp:") ? to : `whatsapp:${to}`;
    const fromNumber = env.TWILIO_WHATSAPP_NUMBER;

    console.log(`[TwilioService] Sending WhatsApp to ${toNumber}`);

    try {
      const message = await this.client.messages.create({
        body,
        from: fromNumber,
        to: toNumber,
      });

      console.log(`[TwilioService] Message sent: ${message.sid}`);
      return message.sid;
    } catch (err) {
      console.error("[TwilioService] Failed to send WhatsApp message:", err);
      throw err;
    }
  }

  static async sendWhatsAppMediaMessage(to: string, body: string, mediaUrl: string): Promise<string> {
    const toNumber = to.startsWith("whatsapp:") ? to : `whatsapp:${to}`;
    const fromNumber = env.TWILIO_WHATSAPP_NUMBER;

    console.log(`[TwilioService] Sending WhatsApp media to ${toNumber}`);

    try {
      const message = await this.client.messages.create({
        body,
        from: fromNumber,
        to: toNumber,
        mediaUrl: [mediaUrl],
      });

      console.log(`[TwilioService] Media message sent: ${message.sid}`);
      return message.sid;
    } catch (err) {
      console.error("[TwilioService] Failed to send WhatsApp media message:", err);
      throw err;
    }
  }
}
