import { supabaseAdmin } from "../lib/supabase";
import { CreateCheckoutSessionRequest } from "../types";
import { NombaService } from "./nomba.service";
import { StoreService } from "./store.service";
export class CheckoutService {
  static async createSession(
    payload: CreateCheckoutSessionRequest,
    customerEmail: string,
  ) {
    const {
      storeId,
      items,
      discount = 0,
      customerName,
      paymentMethod = "transfer",
    } = payload;

    // 1. Fetch products to calculate total and verify stock
    const productIds = items.map((i) => i.productId);
    const { data: products, error: productError } = await supabaseAdmin
      .from("products")
      .select("*")
      .in("id", productIds)
      .eq("store_id", storeId);

    if (productError || !products || products.length === 0) {
      throw new Error("Failed to fetch products or products not found");
    }

    let subtotal = 0;
    const invoiceItemsData = [];

    for (const item of items) {
      const product = products.find((p) => p.id === item.productId);
      if (!product) throw new Error(`Product not found: ${item.productId}`);

      if (product.stock_quantity < item.quantity) {
        throw new Error(`Insufficient stock for product: ${product.name}`);
      }

      subtotal += product.price * item.quantity;

      invoiceItemsData.push({
        product_id: product.id,
        name: product.name,
        quantity: item.quantity,
        price: product.price, // snapshot price
      });
    }

    const totalAmount = Math.max(0, subtotal - discount);

    // 2. Create invoice
    const { data: invoice, error: invoiceError } = await supabaseAdmin
      .from("invoices")
      .insert({
        store_id: storeId,
        subtotal: subtotal,
        discount: discount,
        total_amount: totalAmount,
        payment_method: paymentMethod, // e.g. "transfer" or "card"
        customer_name: customerName,
        status: "pending",
      })
      .select()
      .single();

    if (invoiceError)
      throw new Error(`Failed to create invoice: ${invoiceError.message}`);

    // 3. Insert invoice items
    const invoiceItemsToInsert = invoiceItemsData.map((item) => ({
      ...item,
      invoice_id: invoice.id,
    }));

    const { error: itemsError } = await supabaseAdmin
      .from("invoice_items")
      .insert(invoiceItemsToInsert);

    if (itemsError)
      throw new Error(`Failed to insert invoice items: ${itemsError.message}`);

    // 4. Create a per-invoice dynamic virtual account.
    // The accountRef is set to "inv_<invoiceId>" so when Nomba fires the
    // vact_transfer webhook, aliasAccountReference = "inv_<invoiceId>" gives
    // us a secure, 1-to-1 invoice match with no ambiguity.
    const store = await StoreService.getStoreById(storeId);
    const dynamicAccount = await NombaService.createDynamicVirtualAccount({
      invoiceId: invoice.id,
      storeName: store.name,
      amount: totalAmount,
    });

    if (!dynamicAccount.accountNumber) {
      throw new Error("Failed to create dynamic virtual account for invoice");
    }

    const orderReference = `pz_${invoice.id}`;

    // 5. Create Payment record in DB
    const { data: payment, error: paymentError } = await supabaseAdmin
      .from("payments")
      .insert({
        invoice_id: invoice.id,
        provider: "nomba",
        provider_reference: `transfer_${invoice.id}`,
        amount: totalAmount,
        status: "pending",
      })
      .select()
      .single();

    if (paymentError)
      throw new Error(
        `Failed to create payment record: ${paymentError.message}`,
      );

    // 6. Create a pending wallet transaction so it appears in transaction history immediately.
    const { error: transactionError } = await supabaseAdmin
      .from("transactions")
      .insert({
        store_id: storeId,
        type: "credit",
        channel: "transfer",
        amount: totalAmount,
        reference: orderReference,
        counterparty: customerName ?? customerEmail,
        status: "pending",
      });

    if (transactionError)
      throw new Error(
        `Failed to create pending transaction: ${transactionError.message}`,
      );

    // 7. Return Checkout details with the dynamic per-invoice account
    return {
      invoiceId: invoice.id,
      items: invoiceItemsData,
      total: totalAmount,
      paymentStatus: payment.status,
      orderReference,
      virtualAccount: {
        accountNumber: dynamicAccount.accountNumber,
        bankName: dynamicAccount.bankName,
        accountName: dynamicAccount.accountName,
      }
    };
  }
}
