import { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { SalesService } from "../services/sales.service";
import { StoreService } from "../services/store.service";

export class SalesController {
  static async checkout(req: Request, res: Response) {
    await StoreService.assertOwnership(req.user.id, req.body.storeId);
    const invoice = await SalesService.checkout(req.body);
    res.status(StatusCodes.CREATED).json(invoice);
  }
}
