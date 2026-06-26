import { supabaseAdmin } from "../lib/supabase";
import { Product } from "../types";

export class ProductService {
  static async createProduct(data: Partial<Product>): Promise<Product> {
    const { data: product, error } = await supabaseAdmin
      .from("products")
      .insert(data)
      .select()
      .single();

    if (error) throw new Error(error.message);
    return product;
  }

  static async getProducts(storeId: string): Promise<Product[]> {
    const { data, error } = await supabaseAdmin
      .from("products")
      .select()
      .eq("store_id", storeId);

    if (error) throw new Error(error.message);
    return data;
  }

  static async getProductByBarcode(barcode: string): Promise<Product> {
    const { data, error } = await supabaseAdmin
      .from("products")
      .select()
      .eq("barcode", barcode)
      .single();

    if (error) throw new Error("Product not found by barcode");
    return data;
  }

  static async updateProduct(id: string, updates: Partial<Product>): Promise<Product> {
    const { data, error } = await supabaseAdmin
      .from("products")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) throw new Error(error.message);
    return data;
  }

  static async deleteProduct(id: string): Promise<void> {
    const { error } = await supabaseAdmin
      .from("products")
      .delete()
      .eq("id", id);

    if (error) throw new Error(error.message);
  }
}
