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
      req.query.search as string,
      getPagination(req)
    );
    res.status(StatusCodes.OK).json(result);
  }

  static async getInvoice(req: Request, res: Response) {
    const invoice = await InvoiceService.getInvoice(req.user.id, req.params.id as string);
    res.status(StatusCodes.OK).json(invoice);
  }

  /** Public — no auth, only paid invoices */
  static async downloadInvoice(req: Request, res: Response) {
    const { buffer, filename } = await InvoiceService.getPublicInvoicePdf(req.params.id as string);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Length", buffer.length);
    res.status(StatusCodes.OK).send(buffer);
  }

  /** Public — no auth */
  static async lookupByNumber(req: Request, res: Response) {
    const code = req.params.code as string;
    const storeId = req.query.storeId as string;
    
    if (!storeId) {
      return res.status(StatusCodes.BAD_REQUEST).json({ error: "storeId query parameter is required" });
    }

    const invoice = await InvoiceService.lookupByNumber(code, storeId);
    res.status(StatusCodes.OK).json(invoice);
  }

  /** Send receipt to customer */
  static async sendReceipt(req: Request, res: Response) {
    const { channel, destination } = req.body;
    if (!["email", "whatsapp"].includes(channel)) {
      return res.status(StatusCodes.BAD_REQUEST).json({ error: "channel must be 'email' or 'whatsapp'" });
    }
    if (!destination || typeof destination !== "string" || !destination.trim()) {
      return res.status(StatusCodes.BAD_REQUEST).json({ error: "destination is required" });
    }

    const result = await InvoiceService.sendReceipt(
      req.user.id,
      req.params.id as string,
      channel,
      destination.trim()
    );
    res.status(StatusCodes.OK).json(result);
  }
}
