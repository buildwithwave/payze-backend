import axios from "axios";
import FormData from "form-data";
import { env } from "../config/env";

export class WhatsAppService {
  private static get baseUrl() {
    return `https://graph.facebook.com/v19.0/${env.WHATSAPP_PHONE_NUMBER_ID}`;
  }

  private static get headers() {
    return {
      Authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`,
    };
  }

  static async uploadMedia(buffer: Buffer, filename: string): Promise<string> {
    if (!env.WHATSAPP_ACCESS_TOKEN || !env.WHATSAPP_PHONE_NUMBER_ID) {
      throw new Error("WhatsApp credentials not configured");
    }

    const form = new FormData();
    form.append("messaging_product", "whatsapp");
    form.append("file", buffer, { filename, contentType: "application/pdf" });

    const response = await axios.post(`${this.baseUrl}/media`, form, {
      headers: {
        ...this.headers,
        ...form.getHeaders(),
      },
    });

    return response.data.id;
  }

  static async sendDocument(to: string, mediaId: string, caption: string, filename: string): Promise<void> {
    if (!env.WHATSAPP_ACCESS_TOKEN || !env.WHATSAPP_PHONE_NUMBER_ID) {
      throw new Error("WhatsApp credentials not configured");
    }

    // Format the phone number (strip non-digits, ensure it starts with country code without +)
    const formattedTo = to.replace(/\D/g, "");

    await axios.post(
      `${this.baseUrl}/messages`,
      {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: formattedTo,
        type: "document",
        document: {
          id: mediaId,
          caption,
          filename,
        },
      },
      {
        headers: {
          ...this.headers,
          "Content-Type": "application/json",
        },
      }
    );
  }
}
