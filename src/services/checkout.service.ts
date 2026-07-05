import { supabaseAdmin } from "../lib/supabase";
import { CreateCheckoutSessionRequest } from "../types";
import { NombaService } from "./nomba.service";

export class CheckoutService {
  static async createSession(payload: CreateCheckoutSessionRequest, customerEmail: string) {
    const { storeId, items, discount = 0, customerName, paymentMethod = "transfer" } = payload;
    
    // 1. Fetch products to calculate total and verify stock
    const productIds = items.map(i => i.productId);
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
      const product = products.find(p => p.id === item.productId);
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

    if (invoiceError) throw new Error(`Failed to create invoice: ${invoiceError.message}`);

    // 3. Insert invoice items
    const invoiceItemsToInsert = invoiceItemsData.map(item => ({
      ...item,
      invoice_id: invoice.id,
    }));

    const { error: itemsError } = await supabaseAdmin
      .from("invoice_items")
      .insert(invoiceItemsToInsert);

    if (itemsError) throw new Error(`Failed to insert invoice items: ${itemsError.message}`);

    // 4. Generate Nomba Payment Link
    const nombaPayment = await NombaService.createPayment(invoice.id, totalAmount, customerEmail);

    // 5. Create Payment record in DB
    const { data: payment, error: paymentError } = await supabaseAdmin
      .from("payments")
      .insert({
        invoice_id: invoice.id,
        provider: "nomba",
        amount: totalAmount,
        status: "pending",
      })
      .select()
      .single();

    if (paymentError) throw new Error(`Failed to create payment record: ${paymentError.message}`);

    // 6. Return Checkout details
    return {
      invoiceId: invoice.id,
      items: invoiceItemsData,
      total: totalAmount,
      paymentStatus: payment.status,
      checkoutLink: nombaPayment.checkoutLink,
      orderReference: nombaPayment.orderReference,
    };
  }
}
