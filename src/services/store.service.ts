import { StatusCodes } from "http-status-codes";
import { supabaseAdmin } from "../lib/supabase";
import { Store } from "../types";
import { AppError } from "../utils/appError";

import { WalletService } from "./wallet.service";

export class StoreService {
  static async createStore(userId: string, name: string): Promise<Store> {
    if (!name || !name.trim()) {
      throw new AppError("Store name is required", StatusCodes.BAD_REQUEST);
    }

    const { data, error } = await supabaseAdmin
      .from("stores")
      .insert({ user_id: userId, name: name.trim() })
      .select()
      .single();

    if (error) throw new AppError(error.message);

    // Provision virtual account immediately in the background or awaited.
    // getOrCreateVirtualAccount handles its own errors silently.
    await WalletService.getOrCreateVirtualAccount(data);

    return data;
  }

  static async listStores(userId: string): Promise<Store[]> {
    const { data, error } = await supabaseAdmin
      .from("stores")
      .select()
      .eq("user_id", userId)
      .order("created_at", { ascending: true });

    if (error) throw new AppError(error.message);
    return data;
  }

  static async getStoreById(storeId: string): Promise<Store> {
    const { data, error } = await supabaseAdmin
      .from("stores")
      .select()
      .eq("id", storeId)
      .single();

    if (error) throw new AppError("Store not found", StatusCodes.NOT_FOUND);
    return data;
  }

  static async updateStore(userId: string, storeId: string, name: string): Promise<Store> {
    if (!name || !name.trim()) {
      throw new AppError("Store name is required", StatusCodes.BAD_REQUEST);
    }

    await this.assertOwnership(userId, storeId);

    const { data, error } = await supabaseAdmin
      .from("stores")
      .update({ name: name.trim() })
      .eq("id", storeId)
      .select()
      .single();

    if (error) throw new AppError(error.message);
    return data;
  }

  // Every catalog/sales resource is store-scoped; call this before touching one.
  static async assertOwnership(userId: string, storeId: string): Promise<Store> {
    if (!storeId) {
      throw new AppError("storeId is required", StatusCodes.BAD_REQUEST);
    }

    const { data, error } = await supabaseAdmin
      .from("stores")
      .select()
      .eq("id", storeId)
      .eq("user_id", userId)
      .maybeSingle();

    if (error) throw new AppError(error.message);
    if (!data) throw new AppError("Store not found", StatusCodes.NOT_FOUND);
    return data;
  }
}
