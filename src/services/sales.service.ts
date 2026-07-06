import { StatusCodes } from "http-status-codes";
import { supabaseAdmin } from "../lib/supabase";
import { AppError } from "../utils/appError";

export interface CheckoutRequest {
  storeId: string;
  items: Array<{ productId: string; quantity: number }>;
  discount?: number;
  paymentMethod: "cash" | "nomba";
  amountTendered?: number;
  customerName?: string;
}

const PAYMENT_METHODS = ["cash", "nomba"] as const;

// Custom SQLSTATEs raised by the pos_checkout function
const PG_BAD_REQUEST = "P0400";
const PG_CONFLICT = "P0409";

export class SalesService {
  static async checkout(payload: CheckoutRequest) {
    const { storeId, items, discount, paymentMethod, amountTendered, customerName } = payload;

    if (!Array.isArray(items) || items.length === 0) {
      throw new AppError("Cart is empty", StatusCodes.BAD_REQUEST);
    }
    if (!PAYMENT_METHODS.includes(paymentMethod)) {
      throw new AppError("Payment method must be cash or nomba", StatusCodes.BAD_REQUEST);
    }
    if (discount !== undefined && (typeof discount !== "number" || discount < 0)) {
      throw new AppError("Discount must be 0 or more", StatusCodes.BAD_REQUEST);
    }
    if (paymentMethod === "cash" && typeof amountTendered !== "number") {
      throw new AppError("Amount tendered is required for cash payments", StatusCodes.BAD_REQUEST);
    }

    // The stock check in pos_checkout assumes one line per product — merge duplicates.
    const merged = new Map<string, number>();
    for (const item of items) {
      if (!item?.productId || !Number.isInteger(item.quantity) || item.quantity <= 0) {
        throw new AppError("Each cart item needs a productId and a positive quantity", StatusCodes.BAD_REQUEST);
      }
      merged.set(item.productId, (merged.get(item.productId) ?? 0) + item.quantity);
    }

    const { data, error } = await supabaseAdmin.rpc("pos_checkout", {
      p_store_id: storeId,
      p_items: Array.from(merged, ([productId, quantity]) => ({ productId, quantity })),
      p_discount: discount ?? 0,
      p_payment_method: paymentMethod,
      p_amount_tendered: paymentMethod === "cash" ? amountTendered : null,
      p_customer_name: customerName ?? null,
    });

    if (error) {
      if (error.code === PG_CONFLICT) throw new AppError(error.message, StatusCodes.CONFLICT);
      if (error.code === PG_BAD_REQUEST) throw new AppError(error.message, StatusCodes.BAD_REQUEST);
      throw new AppError(error.message);
    }

    // pos_checkout already returns the invoice in the API's camelCase shape
    return data;
  }
}
