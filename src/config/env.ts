import dotenv from "dotenv";

dotenv.config();

export const env = {
  PORT: parseInt(process.env.PORT || "5000", 10),
  NODE_ENV: process.env.NODE_ENV || "development",
  API_PREFIX: process.env.API_PREFIX || "/api",

  SUPABASE_URL: process.env.SUPABASE_URL || "",
  SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY || "",
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY || "",

  NOMBA_CLIENT_ID: process.env.NOMBA_CLIENT_ID || "",
  NOMBA_CLIENT_SECRET: process.env.NOMBA_CLIENT_SECRET || "",
  NOMBA_ACCOUNT_ID: process.env.NOMBA_ACCOUNT_ID || "",
  NOMBA_SUB_ACCOUNT_ID: process.env.NOMBA_SUB_ACCOUNT_ID || "",
  NOMBA_WEBHOOK_SECRET: process.env.NOMBA_WEBHOOK_SECRET || "",
  INTERNAL_API_KEY: process.env.INTERNAL_API_KEY || "",
  NOMBA_BASE_URL: (process.env.NOMBA_BASE_URL || "https://sandbox.nomba.com")
    .replace(/\/+$/, "")
    .concat(process.env.NOMBA_BASE_URL?.endsWith("/v1") ? "" : "/v1"),
  APP_BASE_URL: process.env.APP_BASE_URL || "https://aurea-nonattributive-vyingly.ngrok-free.dev",

  CLOUDINARY_CLOUD_NAME: process.env.CLOUDINARY_CLOUD_NAME || "",
  CLOUDINARY_API_KEY: process.env.CLOUDINARY_API_KEY || "",
  CLOUDINARY_API_SECRET: process.env.CLOUDINARY_API_SECRET || "",

  RESEND_API_KEY: process.env.RESEND_API_KEY || "",
  FRONTEND_BASE_URL: process.env.FRONTEND_BASE_URL || process.env.FRONTEND_URL || "http://localhost:3000",
  FRONTEND_URL: process.env.FRONTEND_URL || "http://localhost:3000",

  WHATSAPP_ACCESS_TOKEN: process.env.WHATSAPP_ACCESS_TOKEN || "",
  WHATSAPP_PHONE_NUMBER_ID: process.env.WHATSAPP_PHONE_NUMBER_ID || "",

  TWILIO_ACCOUNT_SID: process.env.TWILIO_ACCOUNT_SID || "",
  TWILIO_AUTH_TOKEN: process.env.TWILIO_AUTH_TOKEN || "",
  TWILIO_WHATSAPP_NUMBER: process.env.TWILIO_WHATSAPP_NUMBER || "whatsapp:+14155238886",
} as const;
