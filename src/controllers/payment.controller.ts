import { Request, Response } from "express";
import { NombaService } from "../services/nomba.service";
import { StatusCodes } from "http-status-codes";
import { supabaseAdmin } from "../lib/supabase";

export class PaymentController {
  static async webhook(req: Request, res: Response) {
    try {
      await NombaService.handleWebhook(req.body);
      res.status(StatusCodes.OK).send("OK");
    } catch (error) {
      console.error("Webhook error:", error);
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
