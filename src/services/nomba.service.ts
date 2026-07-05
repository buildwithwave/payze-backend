import crypto from "crypto";
import { env } from "../config/env";
import { supabaseAdmin } from "../lib/supabase";

export class NombaService {
  private static cachedToken: { token: string; expiresAt: number } | null = null;
  private static fallbackBanks = [
    { name: "Access Bank", code: "044" },
    { name: "Fidelity Bank", code: "070" },
    { name: "First Bank of Nigeria", code: "011" },
    { name: "First City Monument Bank", code: "214" },
    { name: "Guaranty Trust Bank", code: "058" },
    { name: "Keystone Bank", code: "082" },
    { name: "Kuda Microfinance Bank", code: "50211" },
    { name: "Moniepoint Microfinance Bank", code: "50515" },
    { name: "Opay Digital Services", code: "999992" },
    { name: "PalmPay", code: "999991" },
    { name: "Polaris Bank", code: "076" },
    { name: "Nomba Sandbox Test Bank", code: "053" },
    { name: "Stanbic IBTC Bank", code: "221" },
    { name: "Sterling Bank", code: "232" },
    { name: "Union Bank of Nigeria", code: "032" },
    { name: "United Bank for Africa", code: "033" },
    { name: "Wema Bank", code: "035" },
    { name: "Zenith Bank", code: "057" },
  ];

  private static async getAccessToken(): Promise<string> {
    if (this.cachedToken && Date.now() < this.cachedToken.expiresAt) {
      return this.cachedToken.token;
    }

    const url = `${env.NOMBA_BASE_URL}/auth/token/issue`;
    console.log(`\n[NombaService] Requesting access token...`);
    console.log(`[NombaService] URL: ${url}`);
    console.log(`[NombaService] Headers:`, {
      "Content-Type": "application/json",
      "accountId": env.NOMBA_ACCOUNT_ID,
    });
    console.log(`[NombaService] Body:`, {
      grant_type: "client_credentials",
      client_id: env.NOMBA_CLIENT_ID,
      client_secret: "***" + env.NOMBA_CLIENT_SECRET.slice(-4),
    });

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

    const text = await response.text();
    console.log(`[NombaService] Auth Response Status: ${response.status}`);
    console.log(`[NombaService] Auth Response Body: ${text}`);

    if (!response.ok) {
      console.error("[NombaService] Auth failed:", text, "URL:", url);
      throw new Error("Failed to get Nomba access token");
    }

    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      throw new Error("Failed to parse Nomba auth response");
    }

    // Tokens last ~30 min; refresh 1 min early. Fall back to 25 min if unspecified.
    const expiresAtMs = Date.parse(data.data?.expiresAt ?? "") || Date.now() + 26 * 60 * 1000;
    this.cachedToken = { token: data.data.access_token, expiresAt: expiresAtMs - 60 * 1000 };
    return data.data.access_token;
  }

  private static async request(path: string, options: { method?: string; body?: unknown } = {}): Promise<any> {
    const token = await this.getAccessToken();
    const url = `${env.NOMBA_BASE_URL}${path}`;
    const response = await fetch(url, {
      method: options.method ?? "GET",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
        "accountId": env.NOMBA_ACCOUNT_ID,
      },
      ...(options.body !== undefined && { body: JSON.stringify(options.body) }),
    });

    const text = await response.text();
    console.log(`[NombaService] API Response Status: ${response.status}`);
    console.log(`[NombaService] API Response Body: ${text}`);
    let payload: any = null;
    try {
      payload = text ? JSON.parse(text) : null;
    } catch {
      // non-JSON error body
    }

    if (!response.ok) {
      const message = payload?.description || payload?.message || `Nomba request failed (${response.status})`;
      console.error(`Nomba ${options.method ?? "GET"} ${url} failed:`, {
        body: options.body,
        response: text,
      });
      throw new Error(message);
    }

    return payload;
  }

  static async listBanks(): Promise<Array<{ name: string; code: string }>> {
    try {
      const payload = await this.request("/transfers/banks");
      const raw = Array.isArray(payload?.data) ? payload.data : payload?.data?.banks ?? [];
      const banks = raw
        .map((b: any) => ({
          name: b.name ?? b.bankName,
          code: String(b.code ?? b.bankCode ?? ""),
        }))
        .filter((b: { name?: string; code?: string }) => b.name && b.code);

      return banks.length > 0 ? banks : this.fallbackBanks;
    } catch (err) {
      console.warn("Nomba bank list unavailable; using fallback banks:", err instanceof Error ? err.message : err);
      return this.fallbackBanks;
    }
  }

  static async lookupAccount(bankCode: string, accountNumber: string): Promise<{ accountName: string }> {
    const body = { accountNumber: accountNumber.trim(), bankCode: bankCode.trim() };
    const payload = await this.request("/transfers/bank/lookup", {
      method: "POST",
      body,
    });
    const accountName =
      payload?.data?.accountName ??
      payload?.data?.account_name ??
      payload?.data?.bankAccountName ??
      payload?.data?.bank_account_name ??
      payload?.data?.account?.accountName ??
      payload?.data?.account?.account_name;
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
    const bank = Array.isArray(d.banks) && d.banks.length > 0 ? d.banks[0] : null;
    return {
      accountNumber: d.bankAccountNumber ?? d.accountNumber ?? bank?.accountNumber ?? null,
      bankName: d.bankName ?? bank?.bankName ?? "Nomba MFB",
      accountName: d.bankAccountName ?? d.accountName ?? accountName,
      providerRef: d.accountHolderId ?? d.accountRef ?? accountRef,
    };
  }

  static async createPayment(invoiceId: string, amount: number, customerEmail: string): Promise<{ checkoutLink: string; orderReference: string }> {
    const orderReference = `pz_${invoiceId}`;

    const payload = await this.request("/checkout/order", {
      method: "POST",
      body: {
        order: {
          orderReference,
          amount: amount.toString(),
          currency: "NGN",
          customerEmail,
          callbackUrl: `${env.APP_BASE_URL}/api/payments/webhook`,
        },
      },
    });

    if (!payload || !payload.data) {
      console.error("Unexpected Nomba response:", payload);
      throw new Error(`Invalid response format from Nomba: ${JSON.stringify(payload)}`);
    }

    return {
      checkoutLink: payload.data.checkoutLink,
      orderReference: payload.data.orderReference,
    };
  }

  static async verifyPayment(transactionRef: string): Promise<boolean> {
    try {
      const payload = await this.request(`/transactions/accounts/single?transactionRef=${transactionRef}`);
      return payload?.data?.status === "SUCCESS";
    } catch (e) {
      return false;
    }
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

    const paymentMethod = "nomba";

    // 5. Update invoice status
    const { data: paidInvoice } = await supabaseAdmin
      .from("invoices")
      .update({ status: "paid", payment_method: paymentMethod })
      .eq("id", invoiceId)
      .select("id, store_id, total_amount")
      .single();

    // 5.1 Record the credit in the wallet ledger (idempotent via unique reference)
    if (paidInvoice) {
      await supabaseAdmin.from("transactions").insert({
        store_id: paidInvoice.store_id,
        type: "credit",
        channel: paymentMethod,
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
