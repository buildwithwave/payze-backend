import { supabaseAdmin } from "../lib/supabase";
import { TwilioService } from "./twilio.service";
import { NombaService } from "./nomba.service";
import { env } from "../config/env";
import { generateInvoicePdfBuffer } from "../utils/pdfGenerator";
import { serializeInvoice } from "../utils/serializers";
import { UploadService } from "./upload.service";

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
    const session = await this.getOrCreateSession(from);

    // Global commands work in any step
    const upper = text.toUpperCase();
    if (upper === "RESTART" || upper === "RESET" || upper === "START") {
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
        await this.handleStoreCode(session, text);
        break;
      case "scanning_items":
        await this.handleScanningItems(session, text, mediaUrls);
        break;
      case "reviewing_cart":
        await this.handleReviewingCart(session, text);
        break;
      case "awaiting_payment":
        await this.handleAwaitingPayment(session, text);
        break;
      default:
        await this.resetSession(session);
        await this.sendWelcome(from);
    }
  }

  private static async handleStoreCode(
    session: Session,
    text: string,
  ): Promise<void> {
    const code = text.toUpperCase().replace(/\s+/g, "");

    const { data: store } = await supabaseAdmin
      .from("stores")
      .select("id, name, store_code")
      .eq("store_code", code)
      .maybeSingle();

    if (!store) {
      await TwilioService.sendWhatsAppMessage(
        session.phone_number,
        `${EMOJIS.x} Store code "${code}" not found.\n\nPlease check and send a valid store code, or type HELP for assistance.`,
      );
      return;
    }

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

    if (upper === "DONE") {
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
      const extractedBarcodes = await this.extractBarcodesFromMedia(mediaUrls);
      queries.push(...extractedBarcodes);

      if (extractedBarcodes.length === 0 && text.trim() === "") {
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
      const product = await this.findProduct(session.store_id!, query);

      if (!product) {
        notFoundQueries.push(query);
        continue;
      }

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

    if (upper === "PAY") {
      await this.createCheckoutAndPay(session);
      return;
    }

    if (upper === "CLEAR") {
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
    // They already have a payment link. Just remind them.
    await TwilioService.sendWhatsAppMessage(
      session.phone_number,
      `${EMOJIS.pay} You have a pending payment. Please complete it using the link sent earlier.\n\nType *RESTART* to start a new session.`,
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
    if (session.cart.length === 0) {
      await TwilioService.sendWhatsAppMessage(
        session.phone_number,
        `${EMOJIS.warning} Cart is empty. Nothing to pay for!`,
      );
      return;
    }

    const storeId = session.store_id!;
    const cart = session.cart;
    const total = cart.reduce((s, i) => s + i.price * i.quantity, 0);

    try {
      // 1. Create invoice
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

      const { error: itemsError } = await supabaseAdmin.from("invoice_items").insert(items);
      if (itemsError) throw new Error(`Failed to insert invoice items: ${itemsError.message}`);

      // 3. Create Nomba checkout payment
      const nombaPayment = await NombaService.createPayment(
        invoice.id,
        total,
        `whatsapp-${session.phone_number}@payze.app`,
      );

      // 4. Create payment record
      const { error: paymentError } = await supabaseAdmin.from("payments").insert({
        invoice_id: invoice.id,
        provider: "nomba",
        provider_reference: nombaPayment.providerOrderReference,
        amount: total,
        status: "pending",
      });
      if (paymentError) throw new Error(`Failed to create payment record: ${paymentError.message}`);

      // 5. Create the pending wallet transaction that completion will later settle.
      const { error: transactionError } = await supabaseAdmin
        .from("transactions")
        .insert({
          store_id: storeId,
          type: "credit",
          channel: "transfer",
          amount: total,
          reference: nombaPayment.orderReference,
          counterparty: `WhatsApp ${session.phone_number}`,
          status: "pending",
        });
      if (transactionError) throw new Error(`Failed to create pending transaction: ${transactionError.message}`);

      // 6. Update session
      await this.updateSession(session.id, {
        step: "awaiting_payment",
        invoice_id: invoice.id,
      });

      // 7. Send payment link
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
          `Pay here: ${nombaPayment.checkoutLink}\n\n` +
          `Once payment is confirmed, you'll receive a receipt here ${EMOJIS.receipt}`,
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
    console.log("[WhatsAppCheckout] Handling payment confirmation", { invoiceId });

    // Find the WhatsApp session associated with this invoice
    const { data: session } = await supabaseAdmin
      .from("whatsapp_sessions")
      .select("*")
      .eq("invoice_id", invoiceId)
      .maybeSingle();

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

    if (invoice) {
      try {
        const serializedInvoice = serializeInvoice(invoice, invoice.invoice_items ?? []);
        const pdfBuffer = await generateInvoicePdfBuffer(serializedInvoice, storeName);
        const filename = `Receipt-${serializedInvoice.number || receiptNum || invoiceId}.pdf`;
        const receiptUrl = await UploadService.uploadPdf(pdfBuffer, filename);
        const caption =
          `${EMOJIS.receipt} Receipt from ${storeName}\n\n` +
          `Receipt: ${receiptNum}\n` +
          `Total: ₦${serializedInvoice.total.toLocaleString("en-NG", { minimumFractionDigits: 2 })}`;

        await TwilioService.sendWhatsAppMediaMessage(session.phone_number, caption, receiptUrl);
        console.log("[WhatsAppCheckout] Receipt PDF sent", { invoiceId, phone: session.phone_number });
      } catch (err) {
        console.warn("[WhatsAppCheckout] Receipt PDF delivery failed; sending text confirmation only", {
          invoiceId,
          phone: session.phone_number,
          error: err instanceof Error ? err.message : err,
        });
      }
    }

    await TwilioService.sendWhatsAppMessage(
      session.phone_number,
      `${EMOJIS.check} *Payment Received!*\n\n` +
        `${EMOJIS.receipt} Receipt: *${receiptNum}*\n` +
        `${EMOJIS.store} Store: ${storeName}\n\n` +
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
          "Complete your payment using the link sent.\n• *RESTART* — start a new session";
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
