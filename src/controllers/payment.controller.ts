import { Request, Response } from "express";
import { NombaService } from "../services/nomba.service";
import { StatusCodes } from "http-status-codes";
import { supabaseAdmin } from "../lib/supabase";

export class PaymentController {
  static async checkoutCallback(req: Request, res: Response) {
    const orderId = typeof req.query.orderId === "string" ? req.query.orderId : undefined;
    const orderReference = typeof req.query.orderReference === "string" ? req.query.orderReference : undefined;

    console.log("[NombaCallback] Incoming checkout callback", {
      orderId,
      orderReference,
      userAgent: req.headers["user-agent"],
    });

    try {
      const result = await NombaService.handleCheckoutCallback({ orderId, orderReference });
      console.log("[NombaCallback] Callback handled", result);
      res.status(StatusCodes.OK).json(result);
    } catch (error) {
      console.error("[NombaCallback] Callback error:", {
        message: error instanceof Error ? error.message : error,
        orderId,
        orderReference,
      });
      res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ error: "Callback Error" });
    }
  }

  // Called from the frontend payment-success page. Verifies the order directly
  // with Nomba and completes it if verified — independent of whether the async
  // webhook has (or ever will) arrive.
  static async verify(req: Request, res: Response) {
    const orderId = typeof req.query.orderId === "string" ? req.query.orderId : undefined;
    const orderReference = typeof req.query.orderReference === "string" ? req.query.orderReference : undefined;

    console.log("[PaymentVerify] Verify requested", { orderId, orderReference });

    try {
      const result = await NombaService.verifyAndCompleteCheckout({ orderId, orderReference });
      console.log("[PaymentVerify] Verify handled", result);
      res.status(StatusCodes.OK).json(result);
    } catch (error) {
      console.error("[PaymentVerify] Verify error:", {
        message: error instanceof Error ? error.message : error,
        orderId,
        orderReference,
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
