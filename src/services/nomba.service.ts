import crypto from "crypto";
import { env } from "../config/env";
import { supabaseAdmin } from "../lib/supabase";

export class NombaService {
  private static cachedToken: { token: string; expiresAt: number } | null = null;
  private static uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
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
    const callbackUrl = `${env.FRONTEND_BASE_URL.replace(/\/+$/, "")}/payment-success?orderReference=${encodeURIComponent(merchantOrderReference)}`;

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

  // Balance of the shared parent Nomba account — cumulative across every
  // store's virtual account, not a single store's balance. Admin/internal use only.
  static async getAccountBalance(): Promise<{ amount: number; currency: string }> {
    const payload = await this.request("/accounts/balance");
    return {
      amount: Number(payload?.data?.amount ?? 0),
      currency: payload?.data?.currency ?? "NGN",
    };
  }

  private static isUuid(value: string): boolean {
    return this.uuidPattern.test(value);
  }

  private static amountsMatch(actual: unknown, expected: number): boolean {
    const parsed = Number(actual);
    return Number.isFinite(parsed) && Math.abs(parsed - expected) < 0.01;
  }

  private static async getTransactionStatus(query: string): Promise<any | null> {
    try {
      const payload = await this.request(`/transactions/accounts/single?${query}`);
      return payload?.data ?? null;
    } catch (e) {
      return null;
    }
  }

  private static async checkTransactionStatus(query: string): Promise<boolean> {
    const transaction = await this.getTransactionStatus(query);
    return transaction?.status === "SUCCESS";
  }

  private static async notifyWhatsAppCheckout(invoiceId: string, logLabel: string): Promise<void> {
    try {
      const { WhatsAppCheckoutService } = await import("./whatsapp-checkout.service");
      await WhatsAppCheckoutService.handlePaymentConfirmation(invoiceId);
    } catch (waErr) {
      // Non-critical — don't fail payment completion if WhatsApp notification fails.
      console.warn(`[${logLabel}] WhatsApp notification failed (non-critical):`, waErr);
    }
  }

  static async verifyPayment(transactionRef: string): Promise<boolean> {
    return this.checkTransactionStatus(`transactionRef=${encodeURIComponent(transactionRef)}`);
  }

  // Verify by our own merchant order reference (`pz_<invoiceId>`) — reliable
  // because we control it, unlike Nomba's `orderId` which isn't a transactionRef.
  static async verifyByOrderReference(orderReference: string, expectedAmount?: number): Promise<boolean> {
    const transaction = await this.getTransactionStatus(`orderReference=${encodeURIComponent(orderReference)}`);
    if (transaction?.status !== "SUCCESS") return false;

    if (expectedAmount !== undefined) {
      const amount = transaction.amount ?? transaction.transactionAmount ?? transaction.order?.amount;
      if (!this.amountsMatch(amount, expectedAmount)) return false;
    }

    return true;
  }

  static async handleCheckoutCallback(params: { orderId?: string; orderReference?: string }): Promise<{
    received: true;
    orderId?: string;
    orderReference?: string;
    invoiceId?: string;
    paymentId?: string;
    paymentStatus?: string;
    invoiceStatus?: string;
    nombaVerified: boolean;
  }> {
    const { orderId, orderReference } = params;
    let invoiceId: string | null = null;
    let payment: any = null;

    if (orderReference?.startsWith("pz_")) {
      const parsedInvoiceId = orderReference.slice(3);
      if (this.isUuid(parsedInvoiceId)) {
        invoiceId = parsedInvoiceId;
      } else {
        console.warn("[NombaCallback] Ignoring malformed checkout orderReference", {
          orderId,
          orderReference,
        });
      }
    }

    if (!payment && orderId) {
      const { data, error } = await supabaseAdmin
        .from("payments")
        .select("*")
        .eq("provider_reference", orderId)
        .maybeSingle();

      if (error) {
        console.warn("[NombaCallback] Payment lookup by orderId failed", {
          orderId,
          orderReference,
          error: error.message,
        });
      }

      if (data) {
        payment = data;
        invoiceId = data.invoice_id;
      }
    }

    if (!payment && orderReference) {
      const { data, error } = await supabaseAdmin
        .from("payments")
        .select("*")
        .eq("provider_reference", orderReference)
        .maybeSingle();

      if (error) {
        console.warn("[NombaCallback] Payment lookup by orderReference failed", {
          orderId,
          orderReference,
          error: error.message,
        });
      }

      if (data) {
        payment = data;
        invoiceId = data.invoice_id;
      }
    }

    if (!payment && invoiceId) {
      const { data, error } = await supabaseAdmin
        .from("payments")
        .select("*")
        .eq("invoice_id", invoiceId)
        .maybeSingle();

      if (error) {
        console.warn("[NombaCallback] Payment lookup by invoice failed", {
          orderId,
          orderReference,
          invoiceId,
          error: error.message,
        });
      }

      if (data) payment = data;
    }

    let invoice: any = null;
    if (invoiceId) {
      const { data, error } = await supabaseAdmin
        .from("invoices")
        .select("id, status")
        .eq("id", invoiceId)
        .maybeSingle();

      if (error) {
        console.warn("[NombaCallback] Invoice lookup failed", {
          orderId,
          orderReference,
          invoiceId,
          error: error.message,
        });
      }

      invoice = data;
    }

    // orderId isn't a transactionRef, so verifying with it directly doesn't work.
    // Our own merchant reference is reliable once we've resolved the invoice.
    const nombaVerified = invoiceId && payment
      ? await this.verifyByOrderReference(`pz_${invoiceId}`, Number(payment.amount))
      : false;
    console.log("[NombaCallback] Resolved checkout callback", {
      orderId,
      orderReference,
      invoiceId,
      paymentId: payment?.id,
      paymentStatus: payment?.status,
      invoiceStatus: invoice?.status,
      nombaVerified,
    });

    return {
      received: true,
      orderId,
      orderReference,
      invoiceId: invoiceId ?? undefined,
      paymentId: payment?.id,
      paymentStatus: payment?.status,
      invoiceStatus: invoice?.status,
      nombaVerified,
    };
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
        
        const mySigBuf = Buffer.from(mySig, "base64");
        const theirSigBuf = Buffer.from(signatureValue, "base64");
        const signaturesMatch =
          mySigBuf.length === theirSigBuf.length && crypto.timingSafeEqual(mySigBuf, theirSigBuf);

        if (!signaturesMatch) {
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
      await this.notifyWhatsAppCheckout(invoiceId, "NombaWebhook");
      return;
    }

    await this.completeInvoicePayment({
      invoiceId,
      payment,
      providerRef: transaction.transactionId,
      counterparty: payload.data?.customer?.senderName ?? null,
      orderReference: order.orderReference,
      logLabel: "NombaWebhook",
    });
  }

  // Shared by the webhook and the success-page verify flow: marks the payment/invoice
  // paid, settles the existing wallet transaction, decrements stock, creates the receipt,
  // and notifies the customer. Caller must have already confirmed payment.status !== "successful".
  private static async completeInvoicePayment(params: {
    invoiceId: string;
    payment: any;
    providerRef: string;
    counterparty?: string | null;
    orderReference?: string;
    logLabel?: string;
  }): Promise<void> {
    const { invoiceId, payment, providerRef, counterparty = null, orderReference, logLabel = "NombaPayment" } = params;
    const merchantOrderReference = `pz_${invoiceId}`;
    const logContext = { invoiceId, paymentId: payment.id };

    const { error: paymentUpdateError } = await supabaseAdmin
      .from("payments")
      .update({ status: "successful", provider_reference: providerRef })
      .eq("id", payment.id);

    if (paymentUpdateError) throw new Error(`Failed to update payment: ${paymentUpdateError.message}`);
    console.log(`[${logLabel}] Payment marked successful`, logContext);

    const paymentMethod = "nomba";
    const transactionChannel = "transfer";

    // Update invoice status
    const { data: paidInvoice, error: invoiceUpdateError } = await supabaseAdmin
      .from("invoices")
      .update({ status: "paid", payment_method: paymentMethod })
      .eq("id", invoiceId)
      .select("id, store_id, total_amount")
      .single();

    if (invoiceUpdateError) throw new Error(`Failed to update invoice: ${invoiceUpdateError.message}`);
    console.log(`[${logLabel}] Invoice marked paid`, {
      ...logContext,
      storeId: paidInvoice?.store_id,
      amount: paidInvoice?.total_amount,
    });

    // Mark the pending wallet transaction successful. The checkout flow creates
    // this row up front; if it is missing, fail instead of inventing ledger data.
    if (paidInvoice) {
      const transactionReferences = [
        orderReference,
        merchantOrderReference,
        payment.provider_reference,
        providerRef,
      ].filter((reference): reference is string => Boolean(reference));

      const { data: existingTransaction } = await supabaseAdmin
        .from("transactions")
        .select("id")
        .in("reference", [...new Set(transactionReferences)])
        .limit(1)
        .maybeSingle();

      if (!existingTransaction) {
        throw new Error(`Checkout transaction not found for references: ${[...new Set(transactionReferences)].join(", ")}`);
      }

      const { error: transactionUpdateError } = await supabaseAdmin
        .from("transactions")
        .update({ status: "successful", counterparty })
        .eq("id", existingTransaction.id);
      if (transactionUpdateError) {
        throw new Error(`Failed to update transaction: ${transactionUpdateError.message}`);
      }
      console.log(`[${logLabel}] Pending transaction marked successful`, {
        ...logContext,
        transactionRowId: existingTransaction.id,
      });
    }

    // Decrement stock quantities for purchased items
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
    console.log(`[${logLabel}] Stock decrement complete`, { ...logContext, itemCount: invoiceItems?.length ?? 0 });

    // Create receipt
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
    console.log(`[${logLabel}] Receipt created`, {
      ...logContext,
      receiptId: receipt?.id,
      receiptNumber: receipt?.receipt_number,
    });

    // Notify WhatsApp customer (if this was a WhatsApp checkout)
    await this.notifyWhatsAppCheckout(invoiceId, logLabel);
  }

  // Called from the payment-success page: verifies with Nomba directly (per their
  // guidance to always verify even if a webhook was received) and completes the
  // order if verified and not already completed. Safe to call multiple times.
  static async verifyAndCompleteCheckout(params: { orderId?: string; orderReference?: string }): Promise<{
    received: true;
    orderId?: string;
    orderReference?: string;
    invoiceId?: string;
    paymentId?: string;
    paymentStatus?: string;
    invoiceStatus?: string;
    nombaVerified: boolean;
    completed: boolean;
  }> {
    const status = await this.handleCheckoutCallback(params);

    if (!status.nombaVerified || !status.invoiceId || !status.paymentId) {
      return { ...status, completed: false };
    }

    if (status.paymentStatus === "successful" || status.invoiceStatus === "paid") {
      await this.notifyWhatsAppCheckout(status.invoiceId, "NombaVerify");
      return { ...status, completed: true };
    }

    const { data: payment, error } = await supabaseAdmin
      .from("payments")
      .select("*")
      .eq("id", status.paymentId)
      .single();

    if (error || !payment) {
      console.warn("[NombaVerify] Payment record vanished before completion", { ...status, error: error?.message });
      return { ...status, completed: false };
    }

    await this.completeInvoicePayment({
      invoiceId: status.invoiceId,
      payment,
      providerRef: params.orderId ?? payment.provider_reference,
      orderReference: params.orderReference,
      logLabel: "NombaVerify",
    });

    return { ...status, paymentStatus: "successful", invoiceStatus: "paid", completed: true };
  }
}
