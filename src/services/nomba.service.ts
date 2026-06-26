import crypto from "crypto";
import { env } from "../config/env";
import { supabaseAdmin } from "../lib/supabase";

export class NombaService {
  private static async getAccessToken(): Promise<string> {
    const url = `${env.NOMBA_BASE_URL}/v1/auth/token/issue`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "accountId": env.NOMBA_ACCOUNT_ID,
      },
      body: JSON.stringify({
        grant_type: "client_credentials",
        client_id: env.NOMBA_CLIENT_ID,
        client_secret: env.NOMBA_CLIENT_SECRET,
      }),
    });

    if (!response.ok) {
      throw new Error("Failed to get Nomba access token");
    }

    const data = (await response.json()) as any;
    return data.data.access_token;
  }

  static async createPayment(invoiceId: string, amount: number, customerEmail: string): Promise<{ checkoutLink: string; orderReference: string }> {
    const token = await this.getAccessToken();
    const orderReference = `pz_${invoiceId}`;

    const url = `${env.NOMBA_BASE_URL}/v1/checkout/order`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
        "accountId": env.NOMBA_ACCOUNT_ID,
      },
      body: JSON.stringify({
        order: {
          orderReference,
          amount: amount.toString(),
          currency: "NGN",
          customerEmail,
          callbackUrl: `${env.APP_BASE_URL}/api/payments/webhook`,
        },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("Nomba create payment error:", errText);
      throw new Error("Failed to create Nomba payment");
    }

    const data = (await response.json()) as any;
    if (!data || !data.data) {
      console.error("Unexpected Nomba response:", data);
      throw new Error(`Invalid response format from Nomba: ${JSON.stringify(data)}`);
    }

    return {
      checkoutLink: data.data.checkoutLink,
      orderReference: data.data.orderReference,
    };
  }

  static async verifyPayment(transactionRef: string): Promise<boolean> {
    const token = await this.getAccessToken();
    
    const url = `${env.NOMBA_BASE_URL}/v1/transactions/accounts/single?transactionRef=${transactionRef}`;
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${token}`,
        "accountId": env.NOMBA_ACCOUNT_ID,
      },
    });

    if (!response.ok) return false;

    const data = (await response.json()) as any;
    return data.data?.status === "SUCCESS";
  }

  static generateSignature(payload: any, secret: string, timeStamp: string): string {
    const data = payload.data || {};
    const merchant = data.merchant || {};
    const transaction = data.transaction || {};

    const eventType = payload.event_type || "";
    const requestId = payload.requestId || "";
    const userId = merchant.userId || "";
    const walletId = merchant.walletId || "";
    const transactionId = transaction.transactionId || "";
    const transactionType = transaction.type || "";
    const transactionTime = transaction.time || "";
    let transactionResponseCode = transaction.responseCode || "";

    if (transactionResponseCode === "null") {
      transactionResponseCode = "";
    }

    const hashingPayload = `${eventType}:${requestId}:${userId}:${walletId}:${transactionId}:${transactionType}:${transactionTime}:${transactionResponseCode}:${timeStamp}`;

    const hmac = crypto.createHmac("sha256", secret);
    hmac.update(hashingPayload);
    return hmac.digest("base64");
  }

  static async handleWebhook(payload: any, headers?: any): Promise<void> {
    // 0. Verify webhook signature
    if (headers) {
      const signatureValue = headers["nomba-signature"] || headers["nomba-sig-value"];
      const nombaTimeStamp = headers["nomba-timestamp"];
      
      if (signatureValue && nombaTimeStamp) {
        // Fallback to client secret if webhook secret isn't set, as some accounts might use it
        const secret = env.NOMBA_WEBHOOK_SECRET || env.NOMBA_CLIENT_SECRET;
        const mySig = this.generateSignature(payload, secret, nombaTimeStamp);
        
        if (mySig.toLowerCase() !== signatureValue.toLowerCase()) {
          console.warn("Webhook signature mismatch!", { expected: signatureValue, generated: mySig });
          throw new Error("Invalid webhook signature");
        }
      } else {
        console.warn("Missing webhook signature headers. Proceeding without verification.");
      }
    }

    // 1. Verify webhook structure
    if (payload.event_type !== "payment_success") return;

    const transaction = payload.data?.transaction;
    const order = payload.data?.order;

    if (!transaction || !order) return;

    // 2. The orderReference contains the invoiceId "pz_<invoiceId>"
    const refParts = order.orderReference.split("_");
    if (refParts.length < 2) return;
    const invoiceId = refParts[1];

    // 3. Optional: Verify with Nomba to be safe (Server-to-Server verification)
    const isVerified = await this.verifyPayment(transaction.transactionId);
    if (!isVerified) {
      console.warn("Webhook received but verification failed for", transaction.transactionId);
      return;
    }

    // 4. Find payment record and update status
    const { data: payment } = await supabaseAdmin
      .from("payments")
      .select("*")
      .eq("invoice_id", invoiceId)
      .single();

    if (!payment) return;

    await supabaseAdmin
      .from("payments")
      .update({
        status: "successful",
        provider_reference: transaction.transactionId,
      })
      .eq("id", payment.id);

    // 5. Update invoice status
    await supabaseAdmin
      .from("invoices")
      .update({ status: "paid" })
      .eq("id", invoiceId);

    // 6. Create receipt
    const receiptNumber = `REC-${Date.now().toString().slice(-6)}`;
    await supabaseAdmin
      .from("receipts")
      .insert({
        invoice_id: invoiceId,
        payment_id: payment.id,
        receipt_number: receiptNumber,
      });
  }
}
