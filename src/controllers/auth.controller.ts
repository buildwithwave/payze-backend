import { Request, Response } from "express";
import { supabase, supabaseAdmin } from "../lib/supabase";
import { StatusCodes } from "http-status-codes";

export class AuthController {
  static async register(req: Request, res: Response) {
    const { email, password, full_name } = req.body;

    // Temporarily using supabaseAdmin to bypass email rate limits for testing
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name,
      },
    });

    if (error) {
      return res.status(StatusCodes.BAD_REQUEST).json({ error: error.message });
    }

    res.status(StatusCodes.CREATED).json({
      message: "User registered successfully",
      user: data.user,
    });
  }

  static async login(req: Request, res: Response) {
    const { email, password } = req.body;

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      return res.status(StatusCodes.UNAUTHORIZED).json({ error: error.message });
    }

    res.status(StatusCodes.OK).json({
      message: "Login successful",
      session: data.session,
    });
  }

  static async getMe(req: Request, res: Response) {
    // req.user is set by auth middleware
    res.status(StatusCodes.OK).json({
      user: req.user,
    });
  }
}
