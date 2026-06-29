import { Request, Response } from "express";
import { supabase, supabaseAdmin } from "../lib/supabase";
import { StatusCodes } from "http-status-codes";

export class AuthController {
  static async checkEmail(req: Request, res: Response) {
    const { email } = req.body;

    if (!email) {
      return res.status(StatusCodes.BAD_REQUEST).json({ error: "Email is required" });
    }

    const { data, error } = await supabaseAdmin.auth.admin.listUsers();

    if (error) {
      return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ error: "Failed to check email" });
    }

    const exists = data.users.some((user) => user.email === email);

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

    const user = data.user;

    res.status(StatusCodes.CREATED).json({
      message: "User registered successfully",
      user: {
        id: user.id,
        email: user.email,
        firstName: user.user_metadata?.first_name,
        lastName: user.user_metadata?.last_name,
        businessName: user.user_metadata?.business_name,
        phone: user.user_metadata?.phone,
        createdAt: user.created_at,
      },
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
