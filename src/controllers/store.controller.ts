import { Request, Response } from "express";
import { StoreService } from "../services/store.service";
import { StatusCodes } from "http-status-codes";

export class StoreController {
  static async createStore(req: Request, res: Response) {
    const { name } = req.body;
    const userId = req.user.id;

    const store = await StoreService.createStore(userId, name);
    res.status(StatusCodes.CREATED).json(store);
  }

  static async getStore(req: Request, res: Response) {
    const { id } = req.params;
    const store = await StoreService.getStoreById(id as string);
    res.status(StatusCodes.OK).json(store);
  }

  static async updateStore(req: Request, res: Response) {
    const { id } = req.params;
    const { name } = req.body;
    const store = await StoreService.updateStore(id as string, name);
    res.status(StatusCodes.OK).json(store);
  }
}
