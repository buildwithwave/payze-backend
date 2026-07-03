import { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { MetricsService } from "../services/metrics.service";
import { StoreService } from "../services/store.service";

export class MetricsController {
  static async getOverview(req: Request, res: Response) {
    const storeId = req.query.storeId as string;
    await StoreService.assertOwnership(req.user.id, storeId);
    const overview = await MetricsService.getOverview(req.user.id, storeId);
    res.status(StatusCodes.OK).json(overview);
  }

  static async getSalesTrend(req: Request, res: Response) {
    const storeId = req.query.storeId as string;
    await StoreService.assertOwnership(req.user.id, storeId);
    const trend = await MetricsService.getSalesTrend(storeId, String(req.query.range ?? "1Y"));
    res.status(StatusCodes.OK).json(trend);
  }
}
