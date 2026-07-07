import { StatusCodes } from "http-status-codes";
import { supabaseAdmin } from "../lib/supabase";
import { Invoice, InvoiceItem, PaginatedResponse } from "../types";
import { AppError } from "../utils/appError";
import { Pagination } from "../utils/pagination";
import { serializeInvoice } from "../utils/serializers";
import { EmailService } from "./email.service";
import { WhatsAppService } from "./whatsapp.service";
import { generateInvoicePdfBuffer } from "../utils/pdfGenerator";
import { env } from "../config/env";

export class InvoiceService {
  static async listInvoices(
    storeId: string,
    search: string | undefined,
    pagination: Pagination
  ): Promise<PaginatedResponse<ReturnType<typeof serializeInvoice>>> {
    let query = supabaseAdmin
      .from("invoices")
      .select("*, invoice_items(*)", { count: "exact" })
      .eq("store_id", storeId);

    if (search) {
      const term = search.replace(/[%_,()]/g, "");
      if (term) {
        // Search also covers item names: resolve matching invoice ids first
        const { data: itemMatches } = await supabaseAdmin
          .from("invoice_items")
          .select("invoice_id, invoices!inner(store_id)")
          .eq("invoices.store_id", storeId)
          .ilike("name", `%${term}%`)
          .limit(500);

        const ids = [...new Set((itemMatches ?? []).map((m) => m.invoice_id))];
        const conditions = [`number.ilike.%${term}%`, `customer_name.ilike.%${term}%`];
        if (ids.length > 0) conditions.push(`id.in.(${ids.join(",")})`);
        query = query.or(conditions.join(","));
      }
    }

    const { data, error, count } = await query
      .order("created_at", { ascending: false })
      .range(pagination.from, pagination.to);

    if (error) throw new AppError(error.message);

    return {
      data: (data ?? []).map((row: Invoice & { invoice_items: InvoiceItem[] }) =>
        serializeInvoice(row, row.invoice_items ?? [])
      ),
      total: count ?? 0,
      page: pagination.page,
      limit: pagination.limit,
    };
  }

  static async getInvoice(userId: string, invoiceId: string) {
    const { data, error } = await supabaseAdmin
      .from("invoices")
      .select("*, invoice_items(*), stores!inner(user_id)")
      .eq("id", invoiceId)
      .eq("stores.user_id", userId)
      .maybeSingle();

    if (error) throw new AppError(error.message);
    if (!data) throw new AppError("Invoice not found", StatusCodes.NOT_FOUND);

    return serializeInvoice(data, data.invoice_items ?? []);
  }

  /** Public lookup by invoice number — no auth required */
  static async lookupByNumber(code: string, storeId: string) {
    const { data, error } = await supabaseAdmin
      .from("invoices")
      .select("*, invoice_items(*), stores!inner(name)")
      .eq("number", code.toUpperCase().trim())
      .eq("store_id", storeId)
      .maybeSingle();

    if (error) throw new AppError(error.message);
    if (!data) throw new AppError("Invoice not found", StatusCodes.NOT_FOUND);

    return {
      ...serializeInvoice(data, data.invoice_items ?? []),
      storeName: (data as any).stores?.name ?? "Payze Store",
    };
  }

  /** Send receipt to customer via email or WhatsApp */
  static async sendReceipt(
    userId: string,
    invoiceId: string,
    channel: "email" | "whatsapp",
    destination: string
  ) {
    // Verify ownership
    const { data, error } = await supabaseAdmin
      .from("invoices")
      .select("*, invoice_items(*), stores!inner(user_id, name)")
      .eq("id", invoiceId)
      .eq("stores.user_id", userId)
      .maybeSingle();

    if (error) throw new AppError(error.message);
    if (!data) throw new AppError("Invoice not found", StatusCodes.NOT_FOUND);

    const invoice = serializeInvoice(data, data.invoice_items ?? []);
    const storeName = (data as any).stores?.name ?? "Payze Store";
    const receiptParams = new URLSearchParams({
      code: invoice.number || invoice.id,
      storeId: data.store_id,
    });
    const receiptUrl = `${env.FRONTEND_BASE_URL.replace(/\/+$/, "")}/receipt?${receiptParams.toString()}`;

    if (channel === "email") {
      await EmailService.sendReceipt({
        to: destination,
        storeName,
        invoiceNumber: invoice.number || invoice.id,
        receiptUrl,
        total: invoice.total.toLocaleString("en-NG", { minimumFractionDigits: 2 }),
        items: invoice.items.map((i) => ({
          name: i.name,
          quantity: i.quantity,
          price: i.price * i.quantity,
        })),
      });
      return { sent: true, channel: "email" };
    }

    if (channel === "whatsapp") {
      try {
        const pdfBuffer = await generateInvoicePdfBuffer(invoice, storeName);
        const filename = `Receipt-${invoice.number || invoice.id}.pdf`;
        
        // 1. Upload to WhatsApp Media API
        const mediaId = await WhatsAppService.uploadMedia(pdfBuffer, filename);
        
        // 2. Send the document message
        const caption = `Here's your receipt from ${storeName}!\n\nInvoice: ${invoice.number || invoice.id}\nTotal: ₦${invoice.total.toLocaleString("en-NG", { minimumFractionDigits: 2 })}\n\nView online at ${receiptUrl} using your invoice number.`;
        await WhatsAppService.sendDocument(destination, mediaId, caption, filename);

        return { sent: true, channel: "whatsapp" };
      } catch (err: any) {
        throw new AppError("Failed to deliver WhatsApp message. Please check the number and try again.", StatusCodes.BAD_REQUEST);
      }
    }

    throw new AppError("Invalid channel", StatusCodes.BAD_REQUEST);
  }
}
