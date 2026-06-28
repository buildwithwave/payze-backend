import { Request, Response } from "express";
import { supabase, supabaseAdmin } from "../lib/supabase";
import { StatusCodes } from "http-status-codes";

export class AuthController {
  static async checkEmail(req: Request, res: Response) {
    const { email } = req.body;

    if (!email) {
      return res.status(StatusCodes.BAD_REQUEST).json({ error: "Email is required" });
    }

    const { data, error } = await supabaseAdmin.rpc("get_user_by_email", { email_input: email }).maybeSingle();

    const exists = !!data && !error;

    res.status(StatusCodes.OK).json({ exists });
  }

  static async register(req: Request, res: Response) {
    const { email, password, firstName, lastName, businessName, phone } = req.body;

    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        first_name: firstName,
        last_name: lastName,
        business_name: businessName,
        phone,
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
