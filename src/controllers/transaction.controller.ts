import { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { StoreService } from "../services/store.service";
import { TransactionService } from "../services/transaction.service";
import { getPagination } from "../utils/pagination";

export class TransactionController {
  static async listTransactions(req: Request, res: Response) {
    const store = await StoreService.assertOwnership(req.user.id, req.query.storeId as string);
    const result = await TransactionService.listTransactions(
      store.id,
      (req.query.type as string) || undefined,
      getPagination(req)
    );
    res.status(StatusCodes.OK).json(result);
  }
}
