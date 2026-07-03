import { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { InvoiceService } from "../services/invoice.service";
import { StoreService } from "../services/store.service";
import { getPagination } from "../utils/pagination";

export class InvoiceController {
  static async listInvoices(req: Request, res: Response) {
    const storeId = req.query.storeId as string;
    await StoreService.assertOwnership(req.user.id, storeId);

    const result = await InvoiceService.listInvoices(
      storeId,
      (req.query.search as string) || undefined,
      getPagination(req)
    );
    res.status(StatusCodes.OK).json(result);
  }

  static async getInvoice(req: Request, res: Response) {
    const invoice = await InvoiceService.getInvoice(req.user.id, req.params.id as string);
    res.status(StatusCodes.OK).json(invoice);
  }
}
