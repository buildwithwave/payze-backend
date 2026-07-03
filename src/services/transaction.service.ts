import { supabaseAdmin } from "../lib/supabase";
import { PaginatedResponse, Transaction } from "../types";
import { AppError } from "../utils/appError";
import { Pagination } from "../utils/pagination";
import { serializeTransaction } from "../utils/serializers";

export class TransactionService {
  static async listTransactions(
    storeId: string,
    type: string | undefined,
    pagination: Pagination
  ): Promise<PaginatedResponse<ReturnType<typeof serializeTransaction>>> {
    let query = supabaseAdmin
      .from("transactions")
      .select("*", { count: "exact" })
      .eq("store_id", storeId);

    if (type === "credit" || type === "debit") {
      query = query.eq("type", type);
    }

    const { data, error, count } = await query
      .order("created_at", { ascending: false })
      .range(pagination.from, pagination.to);

    if (error) throw new AppError(error.message);

    return {
      data: (data as Transaction[]).map(serializeTransaction),
      total: count ?? 0,
      page: pagination.page,
      limit: pagination.limit,
    };
  }
}
