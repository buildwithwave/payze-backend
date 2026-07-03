import { supabaseAdmin } from "../lib/supabase";
import { AppError } from "../utils/appError";

export type TrendRange = "7D" | "1M" | "3M" | "6M" | "1Y";

const TREND_RANGES: TrendRange[] = ["7D", "1M", "3M", "6M", "1Y"];

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const startOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1);
const dayKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

export class MetricsService {
  static async getOverview(userId: string, storeId: string) {
    const [products, invoices, stores] = await Promise.all([
      supabaseAdmin.from("products").select("id", { count: "exact", head: true }).eq("store_id", storeId),
      supabaseAdmin.from("invoices").select("id", { count: "exact", head: true }).eq("store_id", storeId),
      supabaseAdmin.from("stores").select("id", { count: "exact", head: true }).eq("user_id", userId),
    ]);

    const firstError = products.error ?? invoices.error ?? stores.error;
    if (firstError) throw new AppError(firstError.message);

    return {
      products: products.count ?? 0,
      orders: invoices.count ?? 0,
      stores: stores.count ?? 0,
      invoices: invoices.count ?? 0,
    };
  }

  static async getSalesTrend(storeId: string, rangeInput: string) {
    const range = (TREND_RANGES.includes(rangeInput as TrendRange) ? rangeInput : "1Y") as TrendRange;

    const now = new Date();
    const daily = range === "7D" || range === "1M";
    const bucketCount = { "7D": 7, "1M": 30, "3M": 3, "6M": 6, "1Y": 12 }[range];

    // Build empty buckets oldest-first, then fill from paid invoices
    const buckets = new Map<string, { label: string; date: string; sales: number }>();
    for (let i = bucketCount - 1; i >= 0; i--) {
      if (daily) {
        const d = startOfDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() - i));
        const label = range === "7D" ? DAY_LABELS[d.getDay()] : `${MONTH_LABELS[d.getMonth()]} ${d.getDate()}`;
        buckets.set(dayKey(d), { label: label as string, date: d.toISOString(), sales: 0 });
      } else {
        const d = startOfMonth(new Date(now.getFullYear(), now.getMonth() - i, 1));
        buckets.set(monthKey(d), { label: MONTH_LABELS[d.getMonth()] as string, date: d.toISOString(), sales: 0 });
      }
    }

    const since = daily
      ? startOfDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() - (bucketCount - 1)))
      : startOfMonth(new Date(now.getFullYear(), now.getMonth() - (bucketCount - 1), 1));

    const { data, error } = await supabaseAdmin
      .from("invoices")
      .select("created_at, total_amount")
      .eq("store_id", storeId)
      .eq("status", "paid")
      .gte("created_at", since.toISOString());

    if (error) throw new AppError(error.message);

    for (const row of data ?? []) {
      const d = new Date(row.created_at);
      const bucket = buckets.get(daily ? dayKey(d) : monthKey(d));
      if (bucket) bucket.sales += Number(row.total_amount);
    }

    return {
      range,
      points: Array.from(buckets.values()).map((b) => ({ ...b, sales: Math.round(b.sales * 100) / 100 })),
    };
  }
}
