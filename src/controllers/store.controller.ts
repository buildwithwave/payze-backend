import { Request, Response } from "express";
import { StoreService } from "../services/store.service";
import { StatusCodes } from "http-status-codes";
import { serializeStore } from "../utils/serializers";

export class StoreController {
  static async createStore(req: Request, res: Response) {
    const { name } = req.body;
    const store = await StoreService.createStore(req.user.id, name);
    res.status(StatusCodes.CREATED).json(serializeStore(store));
  }

  static async listStores(req: Request, res: Response) {
    const stores = await StoreService.listStores(req.user.id);
    res.status(StatusCodes.OK).json(stores.map(serializeStore));
  }

  static async getStore(req: Request, res: Response) {
    const { id } = req.params;
    const store = await StoreService.assertOwnership(req.user.id, id as string);
    res.status(StatusCodes.OK).json(serializeStore(store));
  }

  static async updateStore(req: Request, res: Response) {
    const { id } = req.params;
    const { name } = req.body;
    const store = await StoreService.updateStore(req.user.id, id as string, name);
    res.status(StatusCodes.OK).json(serializeStore(store));
  }

  static async listPublicStores(req: Request, res: Response) {
    const stores = await StoreService.listPublicStores();
    res.status(StatusCodes.OK).json(stores);
  }
}
