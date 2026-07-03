import { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { NombaService } from "../services/nomba.service";
import { StoreService } from "../services/store.service";
import { WalletService } from "../services/wallet.service";
import { AppError } from "../utils/appError";

// Banks rarely change — cache the list for an hour
let banksCache: { banks: Array<{ name: string; code: string }>; expiresAt: number } | null = null;

export class WalletController {
  static async getWallet(req: Request, res: Response) {
    const store = await StoreService.assertOwnership(req.user.id, req.query.storeId as string);
    const wallet = await WalletService.getWallet(store);
    res.status(StatusCodes.OK).json(wallet);
  }

  static async getSummary(req: Request, res: Response) {
    const store = await StoreService.assertOwnership(req.user.id, req.query.storeId as string);
    const summary = await WalletService.getSummary(store.id, String(req.query.period ?? "week"));
    res.status(StatusCodes.OK).json(summary);
  }

  static async withdraw(req: Request, res: Response) {
    const store = await StoreService.assertOwnership(req.user.id, req.body.storeId);
    const transaction = await WalletService.withdraw(store, req.body);
    res.status(StatusCodes.CREATED).json(transaction);
  }

  static async resolveAccount(req: Request, res: Response) {
    const { bankCode, accountNumber } = req.body;
    if (!bankCode || !accountNumber) {
      throw new AppError("bankCode and accountNumber are required", StatusCodes.BAD_REQUEST);
    }

    try {
      const result = await NombaService.lookupAccount(bankCode, accountNumber);
      res.status(StatusCodes.OK).json(result);
    } catch (err) {
      throw new AppError(
        err instanceof Error ? err.message : "Could not resolve account name",
        StatusCodes.BAD_REQUEST
      );
    }
  }

  static async listBanks(_req: Request, res: Response) {
    if (!banksCache || Date.now() > banksCache.expiresAt) {
      const banks = await NombaService.listBanks();
      banksCache = { banks, expiresAt: Date.now() + 60 * 60 * 1000 };
    }
    res.status(StatusCodes.OK).json(banksCache.banks);
  }
}
