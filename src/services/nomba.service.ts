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
    const orderReference = `payze_${invoiceId}_${Date.now()}`;

    const url = `${env.NOMBA_BASE_URL}/v1/checkout/order`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
        "accountId": env.NOMBA_SUB_ACCOUNT_ID || env.NOMBA_ACCOUNT_ID,
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
        "accountId": env.NOMBA_SUB_ACCOUNT_ID || env.NOMBA_ACCOUNT_ID,
      },
    });

    if (!response.ok) return false;

    const data = (await response.json()) as any;
    return data.data?.status === "SUCCESS";
  }

  static async handleWebhook(payload: any): Promise<void> {
    // 1. Verify webhook structure
    if (payload.event_type !== "payment_success") return;

    const transaction = payload.data?.transaction;
    const order = payload.data?.order;

    if (!transaction || !order) return;

    // 2. The orderReference contains the invoiceId "payze_<invoiceId>_<timestamp>"
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
