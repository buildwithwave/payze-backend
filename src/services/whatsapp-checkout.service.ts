import { supabaseAdmin } from "../lib/supabase";
import { TwilioService } from "./twilio.service";
import { NombaService } from "./nomba.service";

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
        await this.handleScanningItems(session, text);
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

  // ─── Step Handlers ───────────────────────────────────────

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
  ): Promise<void> {
    const upper = text.toUpperCase();

    if (upper === "DONE") {
      if (session.cart.length === 0) {
        await TwilioService.sendWhatsAppMessage(
          session.phone_number,
          `${EMOJIS.warning} Your cart is empty! Add at least one item before checking out.\n\nScan a barcode or type a product name.`,
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

    // Try to find the product — first by exact barcode, then by name search
    const product = await this.findProduct(session.store_id!, text);

    if (!product) {
      await TwilioService.sendWhatsAppMessage(
        session.phone_number,
        `${EMOJIS.x} No product found for "${text}".\n\nTry the exact barcode number or product name. Type *CART* to see your current items.`,
      );
      return;
    }

    // Check if already in cart — increment quantity
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

    await this.updateSession(session.id, { cart: session.cart });

    const itemInCart =
      session.cart.find((i) => i.productId === product.id)!;
    const cartTotal = session.cart.reduce(
      (sum, i) => sum + i.price * i.quantity,
      0,
    );

    await TwilioService.sendWhatsAppMessage(
      session.phone_number,
      `${EMOJIS.plus} *${product.name}* × ${itemInCart.quantity} — ₦${(itemInCart.price * itemInCart.quantity).toLocaleString()}\n\n` +
        `Cart: ${session.cart.length} item(s) · ₦${cartTotal.toLocaleString()}\n\n` +
        `Scan more items or type *DONE* to checkout.`,
    );
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

  // ─── Product Search ──────────────────────────────────────

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

      await supabaseAdmin.from("invoice_items").insert(items);

      // 3. Create Nomba checkout payment
      const nombaPayment = await NombaService.createPayment(
        invoice.id,
        total,
        `whatsapp-${session.phone_number}@payze.app`,
      );

      // 4. Create payment record
      await supabaseAdmin.from("payments").insert({
        invoice_id: invoice.id,
        provider: "nomba",
        amount: total,
        status: "pending",
      });

      // 5. Update session
      await this.updateSession(session.id, {
        step: "awaiting_payment",
        invoice_id: invoice.id,
      });

      // 6. Send payment link
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
    // Find the WhatsApp session associated with this invoice
    const { data: session } = await supabaseAdmin
      .from("whatsapp_sessions")
      .select("*")
      .eq("invoice_id", invoiceId)
      .maybeSingle();

    if (!session) return; // Not a WhatsApp checkout

    // Get store name
    const { data: store } = await supabaseAdmin
      .from("stores")
      .select("name")
      .eq("id", session.store_id)
      .maybeSingle();

    // Get receipt number
    const { data: receipt } = await supabaseAdmin
      .from("receipts")
      .select("receipt_number")
      .eq("invoice_id", invoiceId)
      .maybeSingle();

    const storeName = store?.name ?? "the store";
    const receiptNum = receipt?.receipt_number ?? "N/A";

    await TwilioService.sendWhatsAppMessage(
      session.phone_number,
      `${EMOJIS.check} *Payment Received!*\n\n` +
        `${EMOJIS.receipt} Receipt: *${receiptNum}*\n` +
        `${EMOJIS.store} Store: ${storeName}\n\n` +
        `Thank you for shopping! ${EMOJIS.sparkle}\n\n` +
        `Type *START* to begin a new checkout.`,
    );

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
