import { Request, Response, NextFunction } from "express";
import { supabase } from "../lib/supabase";
import { StatusCodes } from "http-status-codes";
import { env } from "../config/env";

// Extend Express Request to hold the user
declare global {
  namespace Express {
    interface Request {
      user?: any;
    }
  }
}

export const requireAuth = async (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(StatusCodes.UNAUTHORIZED).json({ error: "Missing or invalid authorization header" });
  }

  const token = authHeader.split(" ")[1];

  const { data: { user }, error } = await supabase.auth.getUser(token);

  if (error || !user) {
    return res.status(StatusCodes.UNAUTHORIZED).json({ error: "Unauthorized access" });
  }

  req.user = user;
  next();
};

// Gates internal/admin-only endpoints (e.g. platform-wide balance) behind a
// shared secret instead of regular user auth, since no admin/role system exists yet.
export const requireInternalKey = (req: Request, res: Response, next: NextFunction) => {
  const key = req.headers["x-internal-key"];
  if (!env.INTERNAL_API_KEY || key !== env.INTERNAL_API_KEY) {
    return res.status(StatusCodes.UNAUTHORIZED).json({ error: "Unauthorized" });
  }
  next();
};
