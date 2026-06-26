import { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { supabaseAdmin } from "../lib/supabase";

export class ReceiptController {
  static async getReceipt(req: Request, res: Response) {
    const { id } = req.params;

    const { data: receipt, error } = await supabaseAdmin
      .from("receipts")
      .select(`
        *,
        invoices (
          total_amount,
          invoice_items (
            quantity,
            price,
            products (name)
          ),
          stores (name)
        ),
        payments (provider, provider_reference)
      `)
      .eq("id", id)
      .single();

    if (error || !receipt) {
      return res.status(StatusCodes.NOT_FOUND).json({ error: "Receipt not found" });
    }

    res.status(StatusCodes.OK).json({
      receiptNumber: receipt.receipt_number,
      timestamp: receipt.created_at,
      storeName: receipt.invoices?.stores?.name,
      purchasedItems: receipt.invoices?.invoice_items?.map((item: any) => ({
        name: item.products?.name,
        quantity: item.quantity,
        price: item.price,
      })),
      total: receipt.invoices?.total_amount,
      paymentMethod: receipt.payments?.provider,
      transactionReference: receipt.payments?.provider_reference,
    });
  }
}
