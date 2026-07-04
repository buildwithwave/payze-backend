import crypto from "crypto";
import { env } from "../config/env";
import { supabaseAdmin } from "../lib/supabase";

export class NombaService {
  private static cachedToken: { token: string; expiresAt: number } | null = null;

  private static async getAccessToken(): Promise<string> {
    if (this.cachedToken && Date.now() < this.cachedToken.expiresAt) {
      return this.cachedToken.token;
    }

    const url = `${env.NOMBA_BASE_URL}/auth/token/issue`;
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
    // Tokens last ~30 min; refresh 1 min early. Fall back to 25 min if unspecified.
    const expiresAtMs = Date.parse(data.data.expiresAt ?? "") || Date.now() + 26 * 60 * 1000;
    this.cachedToken = { token: data.data.access_token, expiresAt: expiresAtMs - 60 * 1000 };
    return data.data.access_token;
  }

  private static async request(path: string, options: { method?: string; body?: unknown } = {}): Promise<any> {
    const token = await this.getAccessToken();
    const response = await fetch(`${env.NOMBA_BASE_URL}${path}`, {
      method: options.method ?? "GET",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
        "accountId": env.NOMBA_ACCOUNT_ID,
      },
      ...(options.body !== undefined && { body: JSON.stringify(options.body) }),
    });

    const text = await response.text();
    let payload: any = null;
    try {
      payload = text ? JSON.parse(text) : null;
    } catch {
      // non-JSON error body
    }

    if (!response.ok) {
      const message = payload?.description || payload?.message || `Nomba request failed (${response.status})`;
      console.error(`Nomba ${options.method ?? "GET"} ${path} failed:`, text);
      throw new Error(message);
    }

    return payload;
  }

  static async listBanks(): Promise<Array<{ name: string; code: string }>> {
    const payload = await this.request("/transfers/banks");
    const raw = Array.isArray(payload?.data) ? payload.data : payload?.data?.banks ?? [];
    return raw.map((b: any) => ({
      name: b.name ?? b.bankName,
      code: String(b.code ?? b.bankCode),
    }));
  }

  static async lookupAccount(bankCode: string, accountNumber: string): Promise<{ accountName: string }> {
    const payload = await this.request("/transfers/bank/lookup", {
      method: "POST",
      body: { accountNumber, bankCode },
    });
    const accountName = payload?.data?.accountName ?? payload?.data?.account_name;
    if (!accountName) throw new Error("Could not resolve account name");
    return { accountName };
  }

  static async transferToBank(params: {
    amount: number;
    accountNumber: string;
    bankCode: string;
    accountName: string;
    merchantTxRef: string;
    senderName: string;
    narration?: string;
  }): Promise<{ status: string; providerRef?: string }> {
    const payload = await this.request("/transfers/bank", {
      method: "POST",
      body: params,
    });
    return {
      status: String(payload?.data?.status ?? "").toUpperCase(),
      providerRef: payload?.data?.id ?? payload?.data?.meta?.rrn,
    };
  }

  static async createVirtualAccount(accountRef: string, accountName: string): Promise<{
    accountNumber: string | null;
    bankName: string | null;
    accountName: string | null;
    providerRef: string | null;
  }> {
    const payload = await this.request("/accounts/virtual", {
      method: "POST",
      body: { accountRef, accountName, currency: "NGN" },
    });
    const d = payload?.data ?? {};
    // Nomba nests the assigned number differently across API versions — check the known spots
    const bank = Array.isArray(d.banks) && d.banks.length > 0 ? d.banks[0] : null;
    return {
      accountNumber: d.bankAccountNumber ?? d.accountNumber ?? bank?.accountNumber ?? null,
      bankName: d.bankName ?? bank?.bankName ?? "Nomba MFB",
      accountName: d.bankAccountName ?? d.accountName ?? accountName,
      providerRef: d.accountHolderId ?? d.accountRef ?? accountRef,
    };
  }

  static async createPayment(invoiceId: string, amount: number, customerEmail: string): Promise<{ checkoutLink: string; orderReference: string }> {
    const token = await this.getAccessToken();
    const orderReference = `pz_${invoiceId}`;

    const url = `${env.NOMBA_BASE_URL}/checkout/order`;
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
    
    const url = `${env.NOMBA_BASE_URL}/transactions/accounts/single?transactionRef=${transactionRef}`;
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

    if (payment.status === "successful") {
      console.log(`Payment for invoice ${invoiceId} is already marked as successful. Ignoring duplicate webhook.`);
      return;
    }

    await supabaseAdmin
      .from("payments")
      .update({
        status: "successful",
        provider_reference: transaction.transactionId,
      })
      .eq("id", payment.id);

    // 5. Update invoice status
    const { data: paidInvoice } = await supabaseAdmin
      .from("invoices")
      .update({ status: "paid" })
      .eq("id", invoiceId)
      .select("id, store_id, total_amount")
      .single();

    // 5.1 Record the credit in the wallet ledger (idempotent via unique reference)
    if (paidInvoice) {
      const method = String(order.paymentMethod ?? "").toLowerCase();
      await supabaseAdmin.from("transactions").insert({
        store_id: paidInvoice.store_id,
        type: "credit",
        channel: method.includes("card") ? "card" : "transfer",
        amount: paidInvoice.total_amount,
        reference: transaction.transactionId,
        counterparty: payload.data?.customer?.senderName ?? null,
        status: "successful",
      });
    }

    // 5.5 Decrement stock quantities for purchased items
    const { data: invoiceItems } = await supabaseAdmin
      .from("invoice_items")
      .select("product_id, quantity")
      .eq("invoice_id", invoiceId);

    if (invoiceItems && invoiceItems.length > 0) {
      for (const item of invoiceItems) {
        await supabaseAdmin.rpc("decrement_stock", {
          p_id: item.product_id,
          q_subtract: item.quantity,
        });
      }
    }

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
