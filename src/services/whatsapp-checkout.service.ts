import { supabaseAdmin } from "../lib/supabase";
import { TwilioService } from "./twilio.service";
import { NombaService } from "./nomba.service";
import { env } from "../config/env";
import { StoreService } from "./store.service";
import { WalletService } from "./wallet.service";

interface CartItem {
  productId: string;
  name: string;
  quantity: number;
  price: number;
}

interface Session {
  id: string;
  phone_number: string;
  store_id: string | null;
  step: string;
  cart: CartItem[];
  invoice_id: string | null;
  updated_at: string;
}

type Step =
  | "awaiting_store_code"
  | "scanning_items"
  | "reviewing_cart"
  | "awaiting_payment";

const EMOJIS = {
  wave: "👋",
  store: "🏪",
  cart: "🛒",
  check: "✅",
  pay: "💳",
  receipt: "🧾",
  warning: "⚠️",
  x: "❌",
  plus: "➕",
  sparkle: "✨",
};

export class WhatsAppCheckoutService {
  // ─── Entry Point ─────────────────────────────────────────
  static async handleIncomingMessage(
    from: string,
    body: string,
    mediaUrls: string[] = []
  ): Promise<void> {
    const text = body.trim();
    console.log(`[WhatsAppService] handleIncomingMessage from: ${from}, body: "${text}", media: ${mediaUrls.length}`);
    const session = await this.getOrCreateSession(from);
    console.log(`[WhatsAppService] Session state: ${session.step}, cart size: ${session.cart.length}`);

    // Global commands work in any step
    const upper = text.toUpperCase();
    if (upper === "RESTART" || upper === "RESET" || upper === "START") {
      console.log(`[WhatsAppService] Global command matched: ${upper}`);
      await this.resetSession(session);
      await this.sendWelcome(from);
      return;
    }

    if (upper === "HELP" || upper === "MENU") {
      await this.sendHelp(from, session.step as Step);
      return;
    }

    switch (session.step as Step) {
      case "awaiting_store_code":
        console.log(`[WhatsAppService] Routing to handleStoreCode for session ${session.id}`);
        await this.handleStoreCode(session, text);
        break;
      case "scanning_items":
        console.log(`[WhatsAppService] Routing to handleScanningItems for session ${session.id}`);
        await this.handleScanningItems(session, text, mediaUrls);
        break;
      case "reviewing_cart":
        console.log(`[WhatsAppService] Routing to handleReviewingCart for session ${session.id}`);
        await this.handleReviewingCart(session, text);
        break;
      case "awaiting_payment":
        console.log(`[WhatsAppService] Routing to handleAwaitingPayment for session ${session.id}`);
        await this.handleAwaitingPayment(session, text);
        break;
      default:
        console.warn(`[WhatsAppService] Unknown step: ${session.step}, resetting session.`);
        await this.resetSession(session);
        await this.sendWelcome(from);
    }
  }

  private static async handleStoreCode(
    session: Session,
    text: string,
  ): Promise<void> {
    const code = text.toUpperCase().replace(/\s+/g, "");
    console.log(`[WhatsAppService] Looking up store code: ${code}`);

    const { data: store, error } = await supabaseAdmin
      .from("stores")
      .select("id, name, store_code")
      .eq("store_code", code)
      .maybeSingle();

    if (error) {
      console.error(`[WhatsAppService] Error fetching store code ${code}:`, error);
    }

    if (!store) {
      console.log(`[WhatsAppService] Store code ${code} not found.`);
      await TwilioService.sendWhatsAppMessage(
        session.phone_number,
        `${EMOJIS.x} Store code "${code}" not found.\n\nPlease check and send a valid store code, or type HELP for assistance.`,
      );
      return;
    }

    console.log(`[WhatsAppService] Connected session ${session.id} to store ${store.id} (${store.name})`);
    await this.updateSession(session.id, {
      store_id: store.id,
      step: "scanning_items",
      cart: [],
    });

    await TwilioService.sendWhatsAppMessage(
      session.phone_number,
      `${EMOJIS.check} Connected to *${store.name}*!\n\n` +
        `Now scan your items:\n` +
        `• Type the *barcode number* printed on the product\n` +
        `• Or type the *product name* to search\n\n` +
        `Type *DONE* when you've added all your items.`,
    );
  }

  private static async handleScanningItems(
    session: Session,
    text: string,
    mediaUrls: string[]
  ): Promise<void> {
    const upper = text.toUpperCase();
    console.log(`[WhatsAppService] handleScanningItems text: "${upper}", media count: ${mediaUrls.length}`);

    if (upper === "DONE") {
      console.log(`[WhatsAppService] DONE command received. Cart size: ${session.cart.length}`);
      if (session.cart.length === 0) {
        await TwilioService.sendWhatsAppMessage(
          session.phone_number,
          `${EMOJIS.warning} Your cart is empty! Add at least one item before checking out.\n\nScan a barcode, send a photo, or type a product name.`,
        );
        return;
      }
      await this.updateSession(session.id, { step: "reviewing_cart" });
      await this.sendCartSummary(session);
      return;
    }

    if (upper === "CART") {
      if (session.cart.length === 0) {
        await TwilioService.sendWhatsAppMessage(
          session.phone_number,
          `${EMOJIS.cart} Your cart is empty. Start scanning items!`,
        );
      } else {
        await this.sendCartPreview(session);
      }
      return;
    }

    if (upper === "CLEAR") {
      console.log(`[WhatsAppService] CLEAR command received.`);
      await this.updateSession(session.id, { cart: [] });
      session.cart = [];
      await TwilioService.sendWhatsAppMessage(
        session.phone_number,
        `${EMOJIS.check} Cart cleared. Start scanning again!`,
      );
      return;
    }

    const queries: string[] = [];
    if (text) {
      // Allow passing multiple items via comma or newline
      const parts = text.split(/[\n,]/).map(p => p.trim()).filter(Boolean);
      queries.push(...parts);
    }

    if (mediaUrls.length > 0) {
      console.log(`[WhatsAppService] Extracting barcodes from media: ${mediaUrls}`);
      const extractedBarcodes = await this.extractBarcodesFromMedia(mediaUrls);
      console.log(`[WhatsAppService] Extracted barcodes: ${extractedBarcodes.join(", ")}`);
      queries.push(...extractedBarcodes);

      if (extractedBarcodes.length === 0 && text.trim() === "") {
        console.log(`[WhatsAppService] No barcode extracted and no text provided.`);
        await TwilioService.sendWhatsAppMessage(
          session.phone_number,
          `${EMOJIS.x} Could not detect any barcode in the image. Please try a clearer photo or type the barcode/product name.`
        );
        return;
      }
    }

    if (queries.length === 0) return;

    const addedProducts: any[] = [];
    const notFoundQueries: string[] = [];

    for (const query of queries) {
      console.log(`[WhatsAppService] Searching for product with query: "${query}" in store: ${session.store_id}`);
      const product = await this.findProduct(session.store_id!, query);

      if (!product) {
        console.log(`[WhatsAppService] Product not found for query: "${query}"`);
        notFoundQueries.push(query);
        continue;
      }

      console.log(`[WhatsAppService] Product found: ${product.name} (ID: ${product.id})`);

      const existingIdx = session.cart.findIndex(
        (item) => item.productId === product.id,
      );
      if (existingIdx >= 0) {
        session.cart[existingIdx].quantity += 1;
      } else {
        session.cart.push({
          productId: product.id,
          name: product.name,
          quantity: 1,
          price: product.price,
        });
      }
      addedProducts.push(product);
    }

    if (addedProducts.length > 0) {
      await this.updateSession(session.id, { cart: session.cart });
    }

    let responseMsg = "";
    
    // Group added products to display summary neatly
    const groupedAdds = addedProducts.reduce((acc: any, p: any) => {
      acc[p.id] = (acc[p.id] || 0) + 1;
      return acc;
    }, {});

    for (const [pId, qty] of Object.entries(groupedAdds)) {
      const itemInCart = session.cart.find((i) => i.productId === pId)!;
      responseMsg += `${EMOJIS.plus} *${itemInCart.name}* (+${qty}) — ₦${(itemInCart.price * itemInCart.quantity).toLocaleString()}\n`;
    }

    if (notFoundQueries.length > 0) {
      responseMsg += `\n${EMOJIS.x} Not found: ${notFoundQueries.join(", ")}\n`;
    }

    if (addedProducts.length > 0 || notFoundQueries.length > 0) {
      const cartTotal = session.cart.reduce((sum, i) => sum + i.price * i.quantity, 0);
      responseMsg += `\nCart: ${session.cart.length} item(s) · ₦${cartTotal.toLocaleString()}\n\nScan more items or type *DONE* to checkout.`;
      await TwilioService.sendWhatsAppMessage(session.phone_number, responseMsg.trim());
    }
  }

  private static async handleReviewingCart(
    session: Session,
    text: string,
  ): Promise<void> {
    const upper = text.toUpperCase();
    console.log(`[WhatsAppService] handleReviewingCart text: "${upper}"`);

    if (upper === "PAY") {
      console.log(`[WhatsAppService] PAY command received.`);
      await this.createCheckoutAndPay(session);
      return;
    }

    if (upper === "CLEAR") {
      console.log(`[WhatsAppService] CLEAR command received in reviewing cart.`);
      await this.updateSession(session.id, {
        step: "scanning_items",
        cart: [],
      });
      session.cart = [];
      await TwilioService.sendWhatsAppMessage(
        session.phone_number,
        `${EMOJIS.check} Cart cleared. Start scanning again!`,
      );
      return;
    }

    if (upper === "ADD" || upper === "MORE") {
      await this.updateSession(session.id, { step: "scanning_items" });
      await TwilioService.sendWhatsAppMessage(
        session.phone_number,
        `${EMOJIS.plus} OK! Send more barcode numbers or product names. Type *DONE* when finished.`,
      );
      return;
    }

    // If they typed something else, remind them
    await TwilioService.sendWhatsAppMessage(
      session.phone_number,
      `Reply:\n• *PAY* — proceed to payment\n• *ADD* — add more items\n• *CLEAR* — empty your cart and start over`,
    );
  }

  private static async handleAwaitingPayment(
    session: Session,
    text: string,
  ): Promise<void> {
    const upper = text.toUpperCase();
    console.log(`[WhatsAppService] handleAwaitingPayment text: "${upper}"`);

    if (upper === "PAID") {
      console.log(`[WhatsAppService] PAID command received for invoice: ${session.invoice_id}`);
      const { StoreService } = await import("./store.service");
      const { WalletService } = await import("./wallet.service");
      
      try {
        const store = await StoreService.getStoreById(session.store_id!);
        console.log(`[WhatsAppService] Fetched store details for wallet check`);
        const walletAccount = await WalletService.getOrCreateVirtualAccount(store);

        if (!walletAccount || !walletAccount.account_number) {
          await TwilioService.sendWhatsAppMessage(session.phone_number, "Error: Virtual account not found.");
          return;
        }

        const { data: invoice } = await supabaseAdmin.from("invoices").select("total_amount").eq("id", session.invoice_id!).single();
        if (!invoice) return;

        const { data: invoiceStatus } = await supabaseAdmin
          .from("invoices")
          .select("status")
          .eq("id", session.invoice_id!)
          .single();

        if (invoiceStatus?.status === "paid") {
          // Success message and receipt were already handled by `NombaService` calling `handlePaymentConfirmation` 
          // during the webhook. But if the user types PAID again, we can just resend the receipt or acknowledge it.
          await this.handlePaymentConfirmation(session.invoice_id!);
          return;
        }

        await TwilioService.sendWhatsAppMessage(
          session.phone_number,
          `${EMOJIS.warning} We couldn't find your transfer yet. Bank transfers can take a few minutes to process. Please wait a moment and type *PAID* again, or check your bank app.`
        );
      } catch (err) {
        console.error("[WhatsAppCheckout] PAID verification error", err);
        await TwilioService.sendWhatsAppMessage(session.phone_number, "An error occurred while checking your payment. Please try again.");
      }
      return;
    }

    await TwilioService.sendWhatsAppMessage(
      session.phone_number,
      `${EMOJIS.pay} Please transfer the funds to the provided account and type *PAID* when done.\n\nType *RESTART* to start a new session.`,
    );
  }

  // ─── Product Search & Image Decoding ────────────────────

  private static async extractBarcodesFromMedia(mediaUrls: string[]): Promise<string[]> {
    if (mediaUrls.length === 0) return [];
    const barcodes: string[] = [];

    // Lazy load to keep start time fast and avoid unused overhead
    const { readBarcodesFromImageFile } = await import("zxing-wasm/reader");

    for (const url of mediaUrls) {
      try {
        const auth = Buffer.from(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`).toString("base64");
        const response = await fetch(url, {
          headers: {
            "Authorization": `Basic ${auth}`
          }
        });

        if (!response.ok) {
          console.error(`[WhatsAppCheckout] Failed to fetch media from Twilio. Status: ${response.status}`);
          continue;
        }

        const arrayBuffer = await response.arrayBuffer();
        
        const blob = new Blob([arrayBuffer], { type: response.headers.get("content-type") || "image/jpeg" });
        const results = await readBarcodesFromImageFile(blob, {
          tryHarder: true
        });
        
        for (const result of results) {
          if (result.text) barcodes.push(result.text);
        }
      } catch (err) {
        console.error("[WhatsAppCheckout] Failed to process media barcode:", err);
      }
    }
    return barcodes;
  }

  private static async findProduct(
    storeId: string,
    query: string,
  ): Promise<{ id: string; name: string; price: number } | null> {
    // 1. Try exact barcode match
    const { data: barcodeMatch } = await supabaseAdmin
      .from("products")
      .select("id, name, price")
      .eq("store_id", storeId)
      .eq("barcode", query.trim())
      .maybeSingle();

    if (barcodeMatch) return barcodeMatch;

    // 2. Try case-insensitive name search (fuzzy)
    const term = query.replace(/[%_,()]/g, "").trim();
    if (!term) return null;

    const { data: nameMatches } = await supabaseAdmin
      .from("products")
      .select("id, name, price")
      .eq("store_id", storeId)
      .ilike("name", `%${term}%`)
      .limit(1);

    if (nameMatches && nameMatches.length > 0) {
      return nameMatches[0];
    }

    return null;
  }

  // ─── Checkout / Payment ──────────────────────────────────

  private static async createCheckoutAndPay(
    session: Session,
  ): Promise<void> {
    console.log(`[WhatsAppService] Initiating checkout for session ${session.id}`);
    if (session.cart.length === 0) {
      console.log(`[WhatsAppService] Checkout aborted: cart is empty`);
      await TwilioService.sendWhatsAppMessage(
        session.phone_number,
        `${EMOJIS.warning} Cart is empty. Nothing to pay for!`,
      );
      return;
    }

    const storeId = session.store_id!;
    const cart = session.cart;
    const total = cart.reduce((s, i) => s + i.price * i.quantity, 0);
    console.log(`[WhatsAppService] Cart total: ₦${total}`);

    try {
      // 1. Create invoice
      console.log(`[WhatsAppService] Creating invoice in DB...`);
      const { data: invoice, error: invErr } = await supabaseAdmin
        .from("invoices")
        .insert({
          store_id: storeId,
          subtotal: total,
          discount: 0,
          total_amount: total,
          payment_method: "nomba",
          customer_name: `WhatsApp ${session.phone_number}`,
          status: "pending",
        })
        .select()
        .single();

      if (invErr || !invoice) throw new Error(invErr?.message ?? "Failed to create invoice");

      // 2. Insert invoice items
      const items = cart.map((item) => ({
        invoice_id: invoice.id,
        product_id: item.productId,
        name: item.name,
        quantity: item.quantity,
        price: item.price,
      }));

      console.log(`[WhatsAppService] Inserting invoice items...`);
      const { error: itemsError } = await supabaseAdmin.from("invoice_items").insert(items);
      if (itemsError) throw new Error(`Failed to insert invoice items: ${itemsError.message}`);

      // 3. Create a per-invoice dynamic virtual account.
      // accountRef = "inv_<invoiceId>" so the vact_transfer webhook echoes it
      // back as aliasAccountReference for a secure, 1-to-1 invoice match.
      const store = await StoreService.getStoreById(storeId);
      const dynamicAccount = await NombaService.createDynamicVirtualAccount({
        invoiceId: invoice.id,
        storeName: store.name,
        amount: total,
      });

      if (!dynamicAccount.accountNumber) {
        throw new Error("Virtual account could not be created for this invoice");
      }
      console.log(`[WhatsAppService] Dynamic VA created successfully: ${dynamicAccount.accountNumber}`);

      // 4. Create payment record
      console.log(`[WhatsAppService] Creating payment record for invoice...`);
      const { error: paymentError } = await supabaseAdmin.from("payments").insert({
        invoice_id: invoice.id,
        provider: "nomba",
        provider_reference: `transfer_${invoice.id}`,
        amount: total,
        status: "pending",
      });
      if (paymentError) throw new Error(`Failed to create payment record: ${paymentError.message}`);

      // 5. Update session
      await this.updateSession(session.id, {
        step: "awaiting_payment",
        invoice_id: invoice.id,
      });

      // 6. Send payment instructions with the per-invoice account details
      await TwilioService.sendWhatsAppMessage(
        session.phone_number,
        `${EMOJIS.pay} *Payment Summary*\n\n` +
          cart
            .map(
              (i, idx) =>
                `${idx + 1}. ${i.name} × ${i.quantity} — ₦${(i.price * i.quantity).toLocaleString()}`,
            )
            .join("\n") +
          `\n\n*Total: ₦${total.toLocaleString()}*\n\n` +
          `Please transfer exactly *₦${total.toLocaleString()}* to:\n\n` +
          `🏦 Bank: *${dynamicAccount.bankName || 'Nomba MFB'}*\n` +
          `🔢 Account Number: *${dynamicAccount.accountNumber}*\n` +
          `👤 Account Name: *${dynamicAccount.accountName || store.name}*\n\n` +
          `⚠️ *Important:* This account number is unique to your order. Transfer the exact amount shown.\n\n` +
          `Once you've sent the money, type *PAID* to confirm.`,
      );

    } catch (err) {
      console.error("[WhatsAppCheckout] Payment creation failed:", err);
      await TwilioService.sendWhatsAppMessage(
        session.phone_number,
        `${EMOJIS.x} Sorry, something went wrong creating your payment. Please try again.\n\nType *PAY* to retry.`,
      );
    }
  }

  // ─── Payment Confirmation (called from webhook) ─────────

  static async handlePaymentConfirmation(invoiceId: string): Promise<void> {
    console.log(`[WhatsAppCheckout] Handling payment confirmation for invoice: ${invoiceId}`);

    // Find the WhatsApp session associated with this invoice
    const { data: session, error: sessionError } = await supabaseAdmin
      .from("whatsapp_sessions")
      .select("*")
      .eq("invoice_id", invoiceId)
      .maybeSingle();

    if (sessionError) {
      console.error(`[WhatsAppCheckout] Error fetching session for invoice ${invoiceId}:`, sessionError);
    }

    if (!session) {
      console.log("[WhatsAppCheckout] No active WhatsApp session for invoice", { invoiceId });
      return;
    }

    const { data: invoice, error: invoiceError } = await supabaseAdmin
      .from("invoices")
      .select("*, invoice_items(*), stores(name)")
      .eq("id", invoiceId)
      .maybeSingle();

    if (invoiceError || !invoice) {
      console.warn("[WhatsAppCheckout] Paid invoice not found for receipt delivery", {
        invoiceId,
        error: invoiceError?.message,
      });
    }

    const { data: receipt } = await supabaseAdmin
      .from("receipts")
      .select("receipt_number")
      .eq("invoice_id", invoiceId)
      .maybeSingle();

    const storeName = invoice?.stores?.name ?? "the store";
    const receiptNum = receipt?.receipt_number ?? "N/A";
    const receiptCode = invoice?.number ?? receiptNum;
    const receiptParams = new URLSearchParams({
      code: receiptCode,
      storeId: invoice?.store_id ?? session.store_id ?? "",
    });
    const downloadLink = `${env.FRONTEND_BASE_URL.replace(/\/+$/, "")}/receipt?${receiptParams.toString()}`;

    await TwilioService.sendWhatsAppMessage(
      session.phone_number,
      `${EMOJIS.check} *Payment Received!*\n\n` +
        `${EMOJIS.receipt} Receipt: *${receiptNum}*\n` +
        `${EMOJIS.store} Store: ${storeName}\n\n` +
        `Download invoice: ${downloadLink}\n\n` +
        `Thank you for shopping! ${EMOJIS.sparkle}\n\n` +
        `Type *START* to begin a new checkout.`,
    );
    console.log("[WhatsAppCheckout] Payment confirmation text sent", { invoiceId, phone: session.phone_number });

    // Reset the session for next use
    await this.updateSession(session.id, {
      step: "awaiting_store_code",
      store_id: null,
      cart: [],
      invoice_id: null,
    });
  }

  // ─── Session Management ──────────────────────────────────

  private static async getOrCreateSession(
    phoneNumber: string,
  ): Promise<Session> {
    const { data: existing } = await supabaseAdmin
      .from("whatsapp_sessions")
      .select("*")
      .eq("phone_number", phoneNumber)
      .maybeSingle();

    if (existing) return existing as Session;

    // New session — send welcome
    const { data: created } = await supabaseAdmin
      .from("whatsapp_sessions")
      .insert({ phone_number: phoneNumber })
      .select()
      .single();

    await this.sendWelcome(phoneNumber);
    return created as Session;
  }

  private static async updateSession(
    sessionId: string,
    updates: Partial<{
      store_id: string | null;
      step: string;
      cart: CartItem[];
      invoice_id: string | null;
    }>,
  ): Promise<void> {
    await supabaseAdmin
      .from("whatsapp_sessions")
      .update(updates)
      .eq("id", sessionId);
  }

  private static async resetSession(session: Session): Promise<void> {
    await this.updateSession(session.id, {
      step: "awaiting_store_code",
      store_id: null,
      cart: [],
      invoice_id: null,
    });
  }

  // ─── Message Templates ──────────────────────────────────

  private static async sendWelcome(phone: string): Promise<void> {
    await TwilioService.sendWhatsAppMessage(
      phone,
      `${EMOJIS.wave} *Welcome to Payze!*\n\n` +
        `Self-service checkout made easy.\n\n` +
        `To get started, send the *store code* displayed at the checkout counter.\n\n` +
        `_Type HELP at any time for assistance._`,
    );
  }

  private static async sendHelp(
    phone: string,
    currentStep: Step,
  ): Promise<void> {
    let contextHelp = "";
    switch (currentStep) {
      case "awaiting_store_code":
        contextHelp = "Send the store code to connect (e.g., SUP-a1b2).";
        break;
      case "scanning_items":
        contextHelp =
          "Scan barcode or type product name to add items.\n• *DONE* — finish adding items\n• *CART* — view your cart\n• *CLEAR* — empty your cart";
        break;
      case "reviewing_cart":
        contextHelp =
          "• *PAY* — proceed to payment\n• *ADD* — add more items\n• *CLEAR* — empty your cart";
        break;
      case "awaiting_payment":
        contextHelp =
          "Transfer the total amount to the provided bank account.\n• *PAID* — confirm you've transferred the money\n• *RESTART* — start a new session";
        break;
    }

    await TwilioService.sendWhatsAppMessage(
      phone,
      `${EMOJIS.sparkle} *Payze Help*\n\n` +
        `${contextHelp}\n\n` +
        `*Global commands:*\n` +
        `• *RESTART* — start fresh\n` +
        `• *HELP* — show this menu`,
    );
  }

  private static async sendCartSummary(session: Session): Promise<void> {
    const total = session.cart.reduce(
      (s, i) => s + i.price * i.quantity,
      0,
    );

    const itemsList = session.cart
      .map(
        (i, idx) =>
          `${idx + 1}. ${i.name} × ${i.quantity} — ₦${(i.price * i.quantity).toLocaleString()}`,
      )
      .join("\n");

    await TwilioService.sendWhatsAppMessage(
      session.phone_number,
      `${EMOJIS.cart} *Your Cart*\n\n` +
        `${itemsList}\n\n` +
        `*Total: ₦${total.toLocaleString()}*\n\n` +
        `Reply:\n` +
        `• *PAY* — proceed to payment\n` +
        `• *ADD* — add more items\n` +
        `• *CLEAR* — empty cart and start over`,
    );
  }

  private static async sendCartPreview(session: Session): Promise<void> {
    const total = session.cart.reduce(
      (s, i) => s + i.price * i.quantity,
      0,
    );

    const itemsList = session.cart
      .map(
        (i, idx) =>
          `${idx + 1}. ${i.name} × ${i.quantity} — ₦${(i.price * i.quantity).toLocaleString()}`,
      )
      .join("\n");

    await TwilioService.sendWhatsAppMessage(
      session.phone_number,
      `${EMOJIS.cart} *Cart Preview*\n\n${itemsList}\n\nTotal: ₦${total.toLocaleString()}\n\nKeep scanning or type *DONE*.`,
    );
  }
}
