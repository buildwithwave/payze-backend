import crypto from "crypto";
import { StatusCodes } from "http-status-codes";
import { supabaseAdmin } from "../lib/supabase";
import { Store, WalletAccount } from "../types";
import { AppError } from "../utils/appError";
import { serializeTransaction } from "../utils/serializers";
import { NombaService } from "./nomba.service";

export type SummaryPeriod = "day" | "week" | "month";

const PERIOD_DAYS: Record<SummaryPeriod, number> = { day: 1, week: 7, month: 30 };

export class WalletService {
  // Balance is the store's ledger: successful credits minus non-failed debits
  // (pending withdrawals are already committed funds).
  static async getBalance(storeId: string): Promise<number> {
    const { data, error } = await supabaseAdmin
      .from("transactions")
      .select("type, amount, status")
      .eq("store_id", storeId)
      .neq("status", "failed");

    if (error) throw new AppError(error.message);

    let balance = 0;
    for (const t of data ?? []) {
      if (t.type === "credit" && t.status === "successful") balance += Number(t.amount);
      if (t.type === "debit") balance -= Number(t.amount);
    }
    return Math.round(balance * 100) / 100;
  }

  static async getWallet(store: Store) {
    const [balance, account] = await Promise.all([
      this.getBalance(store.id),
      this.getOrCreateVirtualAccount(store),
    ]);

    return {
      balance,
      currency: "NGN",
      accountNumber: account?.account_number ?? null,
      bankName: account?.bank_name ?? null,
      accountName: account?.account_name ?? store.name,
    };
  }

  static async getOrCreateVirtualAccount(store: Store): Promise<WalletAccount | null> {
    const { data: existing, error } = await supabaseAdmin
      .from("wallet_accounts")
      .select()
      .eq("store_id", store.id)
      .maybeSingle();

    if (error) throw new AppError(error.message);
    if (existing) return existing;

    // Provision on first access; if Nomba is unavailable return null so we retry next time
    try {
      const created = await NombaService.createVirtualAccount(`store_${store.id}`, store.name);
      if (!created.accountNumber) return null;

      const { data: saved } = await supabaseAdmin
        .from("wallet_accounts")
        .insert({
          store_id: store.id,
          account_number: created.accountNumber,
          bank_name: created.bankName,
          account_name: created.accountName,
          provider_ref: created.providerRef,
        })
        .select()
        .single();

      return saved;
    } catch (err) {
      console.error("Virtual account provisioning failed:", err);
      return null;
    }
  }

  static async getSummary(storeId: string, periodInput: string) {
    const period = (["day", "week", "month"].includes(periodInput) ? periodInput : "week") as SummaryPeriod;
    const days = PERIOD_DAYS[period];
    const now = Date.now();
    const currentStart = new Date(now - days * 86400000);
    const previousStart = new Date(now - 2 * days * 86400000);

    const { data, error } = await supabaseAdmin
      .from("invoices")
      .select("created_at, total_amount")
      .eq("store_id", storeId)
      .eq("status", "paid")
      .gte("created_at", previousStart.toISOString());

    if (error) throw new AppError(error.message);

    let current = 0;
    let previous = 0;
    for (const row of data ?? []) {
      const t = new Date(row.created_at).getTime();
      if (t >= currentStart.getTime()) current += Number(row.total_amount);
      else previous += Number(row.total_amount);
    }

    const changePercent =
      previous > 0 ? Math.round(((current - previous) / previous) * 100) : current > 0 ? 100 : 0;

    return {
      total: Math.round(current * 100) / 100,
      changePercent,
      period,
    };
  }

  static async withdraw(store: Store, payload: { amount?: number; bankCode?: string; accountNumber?: string }) {
    const { amount, bankCode, accountNumber } = payload;

    if (typeof amount !== "number" || !(amount > 0)) {
      throw new AppError("Amount must be greater than 0", StatusCodes.BAD_REQUEST);
    }
    if (!bankCode || !accountNumber) {
      throw new AppError("bankCode and accountNumber are required", StatusCodes.BAD_REQUEST);
    }

    const balance = await this.getBalance(store.id);
    if (amount > balance) {
      throw new AppError("Insufficient wallet balance", StatusCodes.BAD_REQUEST);
    }

    const { accountName } = await NombaService.lookupAccount(bankCode, accountNumber);
    const merchantTxRef = `wd_${crypto.randomUUID()}`;

    // Commit the debit before calling out, so a crash can't double-spend;
    // mark failed if the transfer is rejected.
    const { data: txn, error: txnError } = await supabaseAdmin
      .from("transactions")
      .insert({
        store_id: store.id,
        type: "debit",
        channel: "withdrawal",
        amount,
        reference: merchantTxRef,
        counterparty: `${accountName} · ${accountNumber}`,
        status: "pending",
      })
      .select()
      .single();

    if (txnError) throw new AppError(txnError.message);

    try {
      const result = await NombaService.transferToBank({
        amount,
        accountNumber,
        bankCode,
        accountName,
        merchantTxRef,
        senderName: store.name,
        narration: `Withdrawal from ${store.name}`,
      });

      const status = result.status === "SUCCESS" ? "successful" : "pending";
      const { data: updated } = await supabaseAdmin
        .from("transactions")
        .update({ status })
        .eq("id", txn.id)
        .select()
        .single();

      return serializeTransaction(updated ?? { ...txn, status });
    } catch (err) {
      await supabaseAdmin.from("transactions").update({ status: "failed" }).eq("id", txn.id);
      throw new AppError(
        err instanceof Error ? err.message : "Withdrawal failed",
        StatusCodes.BAD_GATEWAY
      );
    }
  }
}
