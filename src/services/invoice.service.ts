import { StatusCodes } from "http-status-codes";
import { supabaseAdmin } from "../lib/supabase";
import { Invoice, InvoiceItem, PaginatedResponse } from "../types";
import { AppError } from "../utils/appError";
import { Pagination } from "../utils/pagination";
import { serializeInvoice } from "../utils/serializers";

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
}
