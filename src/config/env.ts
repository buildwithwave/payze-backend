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
  NOMBA_BASE_URL: process.env.NOMBA_BASE_URL || "https://api.nomba.com",

  APP_BASE_URL: process.env.APP_BASE_URL || "https://aurea-nonattributive-vyingly.ngrok-free.dev",

  CLOUDINARY_CLOUD_NAME: process.env.CLOUDINARY_CLOUD_NAME || "",
  CLOUDINARY_API_KEY: process.env.CLOUDINARY_API_KEY || "",
  CLOUDINARY_API_SECRET: process.env.CLOUDINARY_API_SECRET || "",
} as const;
