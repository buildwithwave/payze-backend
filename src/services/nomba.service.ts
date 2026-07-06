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
    console.log("[NombaService] Auth Response Body:", {
      code: data?.code,
      description: data?.description,
      status: data?.status,
      businessId: data?.data?.businessId,
      expiresAt: data?.data?.expiresAt,
      hasAccessToken: Boolean(data?.data?.access_token),
      hasRefreshToken: Boolean(data?.data?.refresh_token),
    });

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

  static async createPayment(invoiceId: string, amount: number, customerEmail: string): Promise<{
    checkoutLink: string;
    orderReference: string;
    merchantOrderReference: string;
    providerOrderReference: string | null;
  }> {
    const merchantOrderReference = `pz_${invoiceId}`;
    const callbackUrl = `${env.APP_BASE_URL}/api/payments/webhook`;

    console.log("[NombaService] Creating checkout order", {
      invoiceId,
      merchantOrderReference,
      amount,
      callbackUrl,
    });

    const payload = await this.request("/checkout/order", {
      method: "POST",
      body: {
        order: {
          orderReference: merchantOrderReference,
          amount: amount.toString(),
          currency: "NGN",
          customerEmail,
          callbackUrl,
        },
      },
    });

    if (!payload || !payload.data) {
      console.error("Unexpected Nomba response:", payload);
      throw new Error(`Invalid response format from Nomba: ${JSON.stringify(payload)}`);
    }

    const providerOrderReference = payload.data.orderReference ?? null;
    console.log("[NombaService] Checkout order created", {
      invoiceId,
      merchantOrderReference,
      providerOrderReference,
      checkoutLink: payload.data.checkoutLink ? "[present]" : "[missing]",
    });

    return {
      checkoutLink: payload.data.checkoutLink,
      orderReference: providerOrderReference ?? merchantOrderReference,
      merchantOrderReference,
      providerOrderReference,
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
    const logContext = {
      eventType: payload?.event_type,
      requestId: payload?.requestId,
      orderReference: payload?.data?.order?.orderReference,
      transactionId: payload?.data?.transaction?.transactionId,
    };

    console.log("[NombaWebhook] Handling webhook", logContext);

    // 0. Verify webhook signature
    if (headers) {
      const signatureValue = headers["nomba-signature"] || headers["nomba-sig-value"];
      const nombaTimeStamp = headers["nomba-timestamp"];
      console.log("[NombaWebhook] Signature headers", {
        ...logContext,
        hasSignature: Boolean(signatureValue),
        hasTimestamp: Boolean(nombaTimeStamp),
      });
      
      if (signatureValue && nombaTimeStamp) {
        // Fallback to client secret if webhook secret isn't set, as some accounts might use it
        const secret = env.NOMBA_WEBHOOK_SECRET || env.NOMBA_CLIENT_SECRET;
        const mySig = this.generateSignature(payload, secret, nombaTimeStamp);
        
        if (mySig.toLowerCase() !== signatureValue.toLowerCase()) {
          console.warn("[NombaWebhook] Signature mismatch", logContext);
          throw new Error("Invalid webhook signature");
        }
        console.log("[NombaWebhook] Signature verified", logContext);
      } else {
        console.warn("[NombaWebhook] Missing signature headers. Proceeding without verification.", logContext);
      }
    }

    // 1. Verify webhook structure
    if (payload.event_type !== "payment_success") {
      console.log("[NombaWebhook] Ignoring unsupported event type", logContext);
      return;
    }

    const transaction = payload.data?.transaction;
    const order = payload.data?.order;

    if (!transaction || !order) {
      console.warn("[NombaWebhook] Missing transaction or order data", {
        ...logContext,
        hasTransaction: Boolean(transaction),
        hasOrder: Boolean(order),
      });
      return;
    }

    // 2. Resolve the invoice. Nomba may return our merchant reference
    // (`pz_<invoiceId>`) or its own provider order reference UUID.
    let invoiceId: string | null = null;
    let payment: any = null;
    const refParts = String(order.orderReference ?? "").split("_");

    if (refParts[0] === "pz" && refParts.length >= 2) {
      invoiceId = refParts.slice(1).join("_");
    } else {
      const { data: paymentByProviderRef, error: providerRefLookupError } = await supabaseAdmin
        .from("payments")
        .select("*")
        .eq("provider_reference", order.orderReference)
        .maybeSingle();

      if (providerRefLookupError) {
        console.warn("[NombaWebhook] Provider order reference lookup failed", {
          ...logContext,
          error: providerRefLookupError.message,
        });
      }

      if (paymentByProviderRef) {
        payment = paymentByProviderRef;
        invoiceId = paymentByProviderRef.invoice_id;
      }
    }

    if (!invoiceId) {
      console.warn("[NombaWebhook] Could not resolve invoice from order reference", logContext);
      return;
    }
    const merchantOrderReference = `pz_${invoiceId}`;
    console.log("[NombaWebhook] Resolved invoice", { ...logContext, invoiceId, merchantOrderReference });

    // 3. Optional: Verify with Nomba to be safe (Server-to-Server verification)
    const isVerified = await this.verifyPayment(transaction.transactionId);
    if (!isVerified) {
      console.warn("[NombaWebhook] Server-to-server verification failed", { ...logContext, invoiceId });
      return;
    }
    console.log("[NombaWebhook] Server-to-server verification passed", { ...logContext, invoiceId });

    // 4. Find payment record and update status
    let paymentLookupError: any = null;
    if (!payment) {
      const paymentLookup = await supabaseAdmin
        .from("payments")
        .select("*")
        .eq("invoice_id", invoiceId)
        .single();
      payment = paymentLookup.data;
      paymentLookupError = paymentLookup.error;
    }

    if (paymentLookupError || !payment) {
      console.warn("[NombaWebhook] Payment record not found", {
        ...logContext,
        invoiceId,
        error: paymentLookupError?.message,
      });
      return;
    }
    console.log("[NombaWebhook] Payment record found", {
      ...logContext,
      invoiceId,
      paymentId: payment.id,
      paymentStatus: payment.status,
    });

    if (payment.status === "successful") {
      console.log("[NombaWebhook] Payment already successful. Ignoring duplicate webhook.", {
        ...logContext,
        invoiceId,
        paymentId: payment.id,
      });
      return;
    }

    const { error: paymentUpdateError } = await supabaseAdmin
      .from("payments")
      .update({
        status: "successful",
        provider_reference: transaction.transactionId,
      })
      .eq("id", payment.id);

    if (paymentUpdateError) throw new Error(`Failed to update payment: ${paymentUpdateError.message}`);
    console.log("[NombaWebhook] Payment marked successful", {
      ...logContext,
      invoiceId,
      paymentId: payment.id,
    });

    const paymentMethod = "nomba";
    const transactionChannel = "transfer";

    // 5. Update invoice status
    const { data: paidInvoice, error: invoiceUpdateError } = await supabaseAdmin
      .from("invoices")
      .update({ status: "paid", payment_method: paymentMethod })
      .eq("id", invoiceId)
      .select("id, store_id, total_amount")
      .single();

    if (invoiceUpdateError) throw new Error(`Failed to update invoice: ${invoiceUpdateError.message}`);
    console.log("[NombaWebhook] Invoice marked paid", {
      ...logContext,
      invoiceId,
      storeId: paidInvoice?.store_id,
      amount: paidInvoice?.total_amount,
    });

    // 5.1 Mark the pending wallet transaction successful. Older payments may not
    // have one yet, so insert a successful credit as a fallback.
    if (paidInvoice) {
      const { data: existingTransaction } = await supabaseAdmin
        .from("transactions")
        .select("id")
        .in("reference", [...new Set([order.orderReference, merchantOrderReference].filter(Boolean))])
        .limit(1)
        .maybeSingle();

      if (existingTransaction) {
        const { error: transactionUpdateError } = await supabaseAdmin
          .from("transactions")
          .update({
            status: "successful",
            counterparty: payload.data?.customer?.senderName ?? null,
          })
          .eq("id", existingTransaction.id);
        if (transactionUpdateError) {
          throw new Error(`Failed to update transaction: ${transactionUpdateError.message}`);
        }
        console.log("[NombaWebhook] Pending transaction marked successful", {
          ...logContext,
          invoiceId,
          transactionRowId: existingTransaction.id,
        });
      } else {
        const { data: insertedTransaction, error: transactionInsertError } = await supabaseAdmin.from("transactions").insert({
          store_id: paidInvoice.store_id,
          type: "credit",
          channel: transactionChannel,
          amount: paidInvoice.total_amount,
          reference: transaction.transactionId,
          counterparty: payload.data?.customer?.senderName ?? null,
          status: "successful",
        }).select("id").single();
        if (transactionInsertError) {
          throw new Error(`Failed to insert fallback transaction: ${transactionInsertError.message}`);
        }
        console.log("[NombaWebhook] Fallback transaction inserted", {
          ...logContext,
          invoiceId,
          transactionRowId: insertedTransaction?.id,
        });
      }
    }

    // 5.5 Decrement stock quantities for purchased items
    const { data: invoiceItems, error: invoiceItemsError } = await supabaseAdmin
      .from("invoice_items")
      .select("product_id, quantity")
      .eq("invoice_id", invoiceId);

    if (invoiceItemsError) throw new Error(`Failed to fetch invoice items: ${invoiceItemsError.message}`);
    if (invoiceItems && invoiceItems.length > 0) {
      for (const item of invoiceItems) {
        const { error: stockError } = await supabaseAdmin.rpc("decrement_stock", {
          p_id: item.product_id,
          q_subtract: item.quantity,
        });
        if (stockError) throw new Error(`Failed to decrement stock: ${stockError.message}`);
      }
    }
    console.log("[NombaWebhook] Stock decrement complete", {
      ...logContext,
      invoiceId,
      itemCount: invoiceItems?.length ?? 0,
    });

    // 6. Create receipt
    const receiptNumber = `REC-${Date.now().toString().slice(-6)}`;
    const { data: receipt, error: receiptError } = await supabaseAdmin
      .from("receipts")
      .insert({
        invoice_id: invoiceId,
        payment_id: payment.id,
        receipt_number: receiptNumber,
      })
      .select("id, receipt_number")
      .single();
    if (receiptError) throw new Error(`Failed to create receipt: ${receiptError.message}`);
    console.log("[NombaWebhook] Receipt created", {
      ...logContext,
      invoiceId,
      receiptId: receipt?.id,
      receiptNumber: receipt?.receipt_number,
    });

    // 7. Notify WhatsApp customer (if this was a WhatsApp checkout)
    try {
      const { WhatsAppCheckoutService } = await import("./whatsapp-checkout.service");
      await WhatsAppCheckoutService.handlePaymentConfirmation(invoiceId);
    } catch (waErr) {
      // Non-critical — don't fail the webhook if WhatsApp notification fails
      console.warn("[NombaWebhook] WhatsApp notification failed (non-critical):", waErr);
    }
  }
}
