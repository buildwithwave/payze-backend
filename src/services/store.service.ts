import { supabaseAdmin } from "../lib/supabase";
import { Store } from "../types";

export class StoreService {
  static async createStore(userId: string, name: string): Promise<Store> {
    const { data, error } = await supabaseAdmin
      .from("stores")
      .insert({ user_id: userId, name })
      .select()
      .single();

    if (error) throw new Error(error.message);
    return data;
  }

  static async getStoreById(storeId: string): Promise<Store> {
    const { data, error } = await supabaseAdmin
      .from("stores")
      .select()
      .eq("id", storeId)
      .single();

    if (error) throw new Error(error.message);
    return data;
  }

  static async updateStore(storeId: string, name: string): Promise<Store> {
    const { data, error } = await supabaseAdmin
      .from("stores")
      .update({ name })
      .eq("id", storeId)
      .select()
      .single();

    if (error) throw new Error(error.message);
    return data;
  }
}
