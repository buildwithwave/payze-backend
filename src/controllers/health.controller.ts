import { Request, Response } from "express";
import { sendSuccess } from "../utils/apiResponse";

export const healthCheck = (_req: Request, res: Response): void => {
  sendSuccess(res, {
    status: "ok",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
};
