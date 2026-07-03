import { Request, Response } from "express";
import { ProductService } from "../services/product.service";
import { StoreService } from "../services/store.service";
import { UploadService } from "../services/upload.service";
import { StatusCodes } from "http-status-codes";
import { getPagination } from "../utils/pagination";

export class ProductController {
  static async createProduct(req: Request, res: Response) {
    const storeId = req.body.storeId ?? req.body.store_id;
    await StoreService.assertOwnership(req.user.id, storeId);
    const product = await ProductService.createProduct(storeId, req.body);
    res.status(StatusCodes.CREATED).json(product);
  }

  static async getProducts(req: Request, res: Response) {
    const storeId = req.query.storeId as string;
    await StoreService.assertOwnership(req.user.id, storeId);

    const result = await ProductService.getProducts(
      storeId,
      {
        search: (req.query.search as string) || undefined,
        category: (req.query.category as string) || undefined,
      },
      getPagination(req)
    );
    res.status(StatusCodes.OK).json(result);
  }

  static async getProductByBarcode(req: Request, res: Response) {
    const storeId = req.query.storeId as string;
    await StoreService.assertOwnership(req.user.id, storeId);

    const product = await ProductService.getProductByBarcode(storeId, req.params.barcode as string);
    res.status(StatusCodes.OK).json(product);
  }

  static async updateProduct(req: Request, res: Response) {
    const { id } = req.params;
    const storeId = (req.query.storeId as string) || req.body.storeId;
    const store = await StoreService.assertOwnership(req.user.id, storeId);
    const product = await ProductService.updateProduct(store.id, id as string, req.body);
    res.status(StatusCodes.OK).json(product);
  }

  static async deleteProduct(req: Request, res: Response) {
    const { id } = req.params;
    const storeId = req.query.storeId as string;
    const store = await StoreService.assertOwnership(req.user.id, storeId);
    await ProductService.deleteProduct(store.id, id as string);
    res.status(StatusCodes.NO_CONTENT).send();
  }

  static async uploadImage(req: Request, res: Response) {
    const { id } = req.params;
    const storeId = req.query.storeId as string;
    const store = await StoreService.assertOwnership(req.user.id, storeId);

    if (!req.file) {
      return res.status(StatusCodes.BAD_REQUEST).json({ message: "No image file provided" });
    }

    const url = await UploadService.uploadImage(req.file);
    const product = await ProductService.updateProduct(store.id, id as string, { image: url });
    res.status(StatusCodes.OK).json(product);
  }
}
