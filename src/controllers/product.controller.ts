import { Request, Response } from "express";
import { ProductService } from "../services/product.service";
import { StatusCodes } from "http-status-codes";

export class ProductController {
  static async createProduct(req: Request, res: Response) {
    const product = await ProductService.createProduct(req.body);
    res.status(StatusCodes.CREATED).json(product);
  }

  static async getProducts(req: Request, res: Response) {
    const storeId = req.query.storeId as string;
    if (!storeId) {
      return res.status(StatusCodes.BAD_REQUEST).json({ error: "storeId query param is required" });
    }
    const products = await ProductService.getProducts(storeId);
    res.status(StatusCodes.OK).json(products);
  }

  static async getProductByBarcode(req: Request, res: Response) {
    const { barcode } = req.params;
    const product = await ProductService.getProductByBarcode(barcode as string);
    res.status(StatusCodes.OK).json(product);
  }

  static async updateProduct(req: Request, res: Response) {
    const { id } = req.params;
    const product = await ProductService.updateProduct(id as string, req.body);
    res.status(StatusCodes.OK).json(product);
  }

  static async deleteProduct(req: Request, res: Response) {
    const { id } = req.params;
    await ProductService.deleteProduct(id as string);
    res.status(StatusCodes.NO_CONTENT).send();
  }

  static async uploadImage(req: Request, res: Response) {
    const { id } = req.params;
    if (!req.file) {
      return res.status(StatusCodes.BAD_REQUEST).json({ error: "No image file provided" });
    }

    const product = await ProductService.uploadProductImage(id as string, req.file);
    res.status(StatusCodes.OK).json(product);
  }
}

