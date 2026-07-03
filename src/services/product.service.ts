import { StatusCodes } from "http-status-codes";
import { supabaseAdmin } from "../lib/supabase";
import { PaginatedResponse, Product } from "../types";
import { AppError } from "../utils/appError";
import { Pagination } from "../utils/pagination";
import { serializeProduct } from "../utils/serializers";

// camelCase API payload (see api.md §6)
export interface ProductInput {
  name?: string;
  category?: string;
  price?: number;
  costPrice?: number | null;
  stock?: number;
  lowStockThreshold?: number;
  barcode?: string;
  image?: string | null;
}

const UNIQUE_VIOLATION = "23505";

const toRow = (input: ProductInput): Record<string, unknown> => {
  const row: Record<string, unknown> = {};
  if (input.name !== undefined) row.name = String(input.name).trim();
  if (input.category !== undefined) row.category = String(input.category).trim();
  if (input.price !== undefined) row.price = input.price;
  if (input.costPrice !== undefined) row.cost_price = input.costPrice;
  if (input.stock !== undefined) row.stock_quantity = input.stock;
  if (input.lowStockThreshold !== undefined) row.low_stock_threshold = input.lowStockThreshold;
  if (input.barcode !== undefined) row.barcode = String(input.barcode).trim() || null;
  if (input.image !== undefined) row.image_url = input.image;
  return row;
};

const validate = (input: ProductInput, isCreate: boolean) => {
  if (isCreate || input.name !== undefined) {
    if (!input.name || !String(input.name).trim()) {
      throw new AppError("Product name is required", StatusCodes.BAD_REQUEST);
    }
  }
  if (isCreate || input.category !== undefined) {
    if (!input.category || !String(input.category).trim()) {
      throw new AppError("Category is required", StatusCodes.BAD_REQUEST);
    }
  }
  if (isCreate || input.price !== undefined) {
    if (typeof input.price !== "number" || !(input.price > 0)) {
      throw new AppError("Price must be greater than 0", StatusCodes.BAD_REQUEST);
    }
  }
  if (isCreate || input.stock !== undefined) {
    if (typeof input.stock !== "number" || !Number.isInteger(input.stock) || input.stock < 0) {
      throw new AppError("Stock must be a whole number of 0 or more", StatusCodes.BAD_REQUEST);
    }
  }
  if (input.lowStockThreshold !== undefined) {
    if (!Number.isInteger(input.lowStockThreshold) || input.lowStockThreshold < 0) {
      throw new AppError("Low stock threshold must be a whole number of 0 or more", StatusCodes.BAD_REQUEST);
    }
  }
};

const generateBarcode = (): string => {
  // 13 digits, non-zero leading digit
  let code = String(Math.floor(Math.random() * 9) + 1);
  for (let i = 0; i < 12; i++) code += Math.floor(Math.random() * 10);
  return code;
};

const duplicateBarcodeError = () =>
  new AppError("A product with this barcode already exists", StatusCodes.CONFLICT);

export class ProductService {
  static async createProduct(storeId: string, input: ProductInput) {
    validate(input, true);

    const row = toRow(input);
    row.store_id = storeId;

    // Auto-generate a unique 13-digit barcode when none is supplied
    const autoGenerate = !row.barcode;
    for (let attempt = 0; attempt < (autoGenerate ? 5 : 1); attempt++) {
      if (autoGenerate) row.barcode = generateBarcode();

      const { data, error } = await supabaseAdmin
        .from("products")
        .insert(row)
        .select()
        .single();

      if (!error) return serializeProduct(data);
      if (error.code === UNIQUE_VIOLATION) {
        if (autoGenerate) continue; // collision on generated code — retry
        throw duplicateBarcodeError();
      }
      throw new AppError(error.message);
    }

    throw new AppError("Could not generate a unique barcode, please try again");
  }

  static async getProducts(
    storeId: string,
    filters: { search?: string; category?: string },
    pagination: Pagination
  ): Promise<PaginatedResponse<ReturnType<typeof serializeProduct>>> {
    let query = supabaseAdmin
      .from("products")
      .select("*", { count: "exact" })
      .eq("store_id", storeId);

    if (filters.search) {
      const term = filters.search.replace(/[%_,()]/g, "");
      if (term) query = query.or(`name.ilike.%${term}%,barcode.ilike.%${term}%`);
    }
    if (filters.category) {
      query = query.eq("category", filters.category);
    }

    const { data, error, count } = await query
      .order("created_at", { ascending: false })
      .range(pagination.from, pagination.to);

    if (error) throw new AppError(error.message);

    return {
      data: (data as Product[]).map(serializeProduct),
      total: count ?? 0,
      page: pagination.page,
      limit: pagination.limit,
    };
  }

  static async getProductByBarcode(storeId: string, barcode: string) {
    const { data, error } = await supabaseAdmin
      .from("products")
      .select()
      .eq("store_id", storeId)
      .eq("barcode", barcode)
      .maybeSingle();

    if (error) throw new AppError(error.message);
    if (!data) throw new AppError("No product matches this barcode", StatusCodes.NOT_FOUND);
    return serializeProduct(data);
  }

  static async updateProduct(storeId: string, id: string, input: ProductInput) {
    validate(input, false);

    const row = toRow(input);
    if (Object.keys(row).length === 0) {
      throw new AppError("No fields to update", StatusCodes.BAD_REQUEST);
    }

    const { data, error } = await supabaseAdmin
      .from("products")
      .update(row)
      .eq("id", id)
      .eq("store_id", storeId)
      .select()
      .maybeSingle();

    if (error) {
      if (error.code === UNIQUE_VIOLATION) throw duplicateBarcodeError();
      throw new AppError(error.message);
    }
    if (!data) throw new AppError("Product not found", StatusCodes.NOT_FOUND);
    return serializeProduct(data);
  }

  static async deleteProduct(storeId: string, id: string): Promise<void> {
    // Historical invoices keep their name/price snapshots (FK is ON DELETE SET NULL)
    const { data, error } = await supabaseAdmin
      .from("products")
      .delete()
      .eq("id", id)
      .eq("store_id", storeId)
      .select("id")
      .maybeSingle();

    if (error) throw new AppError(error.message);
    if (!data) throw new AppError("Product not found", StatusCodes.NOT_FOUND);
  }
}
