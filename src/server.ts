import app from "./app";
import { env } from "./config/env";

const server = app.listen(env.PORT, () => {
  console.log(
    `Server running in ${env.NODE_ENV} mode on port ${env.PORT}`
  );
});

process.on("unhandledRejection", (reason: unknown) => {
  console.error("Unhandled Rejection:", reason);
  server.close(() => process.exit(1));
});

process.on("SIGTERM", () => {
  console.log("SIGTERM received. Shutting down gracefully...");
  server.close(() => process.exit(0));
});

