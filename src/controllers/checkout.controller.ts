import { Request, Response } from "express";
import { CheckoutService } from "../services/checkout.service";
import { StatusCodes } from "http-status-codes";

export class CheckoutController {
  static async createSession(req: Request, res: Response) {
    const customerEmail = req.user?.email || "customer@example.com";
    const checkoutSession = await CheckoutService.createSession(req.body, customerEmail);
    res.status(StatusCodes.CREATED).json(checkoutSession);
  }
}
