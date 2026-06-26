import { supabaseAdmin } from "../lib/supabase";
import { Product } from "../types";
import { cloudinary } from "../config/cloudinary";

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

  static async uploadProductImage(id: string, file: Express.Multer.File): Promise<Product> {
    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: "payze/products",
        },
        async (error, result) => {
          if (error) return reject(new Error(error.message));
          if (!result) return reject(new Error("Upload failed"));

          try {
            const product = await this.updateProduct(id, { image_url: result.secure_url });
            resolve(product);
          } catch (err) {
            reject(err);
          }
        }
      );

      uploadStream.end(file.buffer);
    });
  }
}

