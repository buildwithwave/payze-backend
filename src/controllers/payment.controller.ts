import { Request, Response } from "express";
import { NombaService } from "../services/nomba.service";
import { StatusCodes } from "http-status-codes";
import { supabaseAdmin } from "../lib/supabase";

export class PaymentController {

  // Called from the frontend Payment Modal. Verifies the direct bank transfer
  // with Nomba and completes the order if verified. Safe to call multiple times.
  static async verify(req: Request, res: Response) {
    const { invoiceId, expectedAmount, accountNumber } = req.body;

    console.log("[PaymentVerify] Direct transfer verify requested", { invoiceId, expectedAmount, accountNumber });

    if (!invoiceId || !expectedAmount || !accountNumber) {
      return res.status(StatusCodes.BAD_REQUEST).json({ error: "invoiceId, expectedAmount, and accountNumber are required" });
    }

    try {
      const { data: invoice, error } = await supabaseAdmin
        .from("invoices")
        .select("status")
        .eq("id", invoiceId)
        .single();

      if (error || !invoice) {
        return res.status(StatusCodes.NOT_FOUND).json({ error: "Invoice not found" });
      }

      if (invoice.status === "paid") {
        console.log("[PaymentVerify] Webhook has settled the invoice", { invoiceId });
        res.status(StatusCodes.OK).json({ status: "success", message: "Payment verified successfully" });
      } else {
        console.log("[PaymentVerify] Invoice still pending, waiting for webhook", { invoiceId });
        // Return OK but status "pending" so the frontend knows it's not paid yet
        res.status(StatusCodes.OK).json({ status: "pending", message: "Waiting for payment confirmation" });
      }
    } catch (error) {
      console.error("[PaymentVerify] Verify error:", {
        message: error instanceof Error ? error.message : error,
        invoiceId,
      });
      res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ error: "Verification failed" });
    }
  }

  static async webhook(req: Request, res: Response) {
    const signatureValue = req.headers["nomba-signature"] || req.headers["nomba-sig-value"];
    console.log("[PaymentWebhook] Incoming webhook", {
      eventType: req.body?.event_type,
      requestId: req.body?.requestId,
      orderReference: req.body?.data?.order?.orderReference,
      transactionId: req.body?.data?.transaction?.transactionId,
      hasSignature: Boolean(signatureValue),
      hasTimestamp: Boolean(req.headers["nomba-timestamp"]),
      userAgent: req.headers["user-agent"],
    });

    try {
      await NombaService.handleWebhook(req.body, req.headers);
      console.log("[PaymentWebhook] Webhook handled", {
        eventType: req.body?.event_type,
        orderReference: req.body?.data?.order?.orderReference,
        transactionId: req.body?.data?.transaction?.transactionId,
      });
      res.status(StatusCodes.OK).send("OK");
    } catch (error) {
      console.error("[PaymentWebhook] Webhook error:", {
        message: error instanceof Error ? error.message : error,
        eventType: req.body?.event_type,
        orderReference: req.body?.data?.order?.orderReference,
        transactionId: req.body?.data?.transaction?.transactionId,
      });
      res.status(StatusCodes.INTERNAL_SERVER_ERROR).send("Webhook Error");
    }
  }

  static async getPayment(req: Request, res: Response) {
    const { id } = req.params;
    const { data, error } = await supabaseAdmin
      .from("payments")
      .select("*")
      .eq("id", id)
      .single();

    if (error || !data) {
      return res.status(StatusCodes.NOT_FOUND).json({ error: "Payment not found" });
    }

    res.status(StatusCodes.OK).json(data);
  }
}
