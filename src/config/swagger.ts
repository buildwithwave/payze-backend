import swaggerJsdoc from "swagger-jsdoc";
import { env } from "./env";

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Payzee API",
      version: "1.0.0",
      description: "API documentation for Payzee payment backend",
    },
    servers: [
      {
        url: `http://localhost:${env.PORT}${env.API_PREFIX}`,
        description: "Local development server",
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
        },
      },
      schemas: {
        Store: {
          type: "object",
          properties: {
            id: { type: "string", format: "uuid" },
            user_id: { type: "string", format: "uuid" },
            name: { type: "string" },
            created_at: { type: "string", format: "date-time" },
          },
        },
        Product: {
          type: "object",
          properties: {
            id: { type: "string", format: "uuid" },
            store_id: { type: "string", format: "uuid" },
            name: { type: "string" },
            barcode: { type: "string" },
            image_url: { type: "string" },
            price: { type: "number" },
            stock_quantity: { type: "integer" },
            created_at: { type: "string", format: "date-time" },
          },
        },
        Payment: {
          type: "object",
          properties: {
            id: { type: "string", format: "uuid" },
            invoice_id: { type: "string", format: "uuid" },
            provider: { type: "string" },
            provider_reference: { type: "string", nullable: true },
            amount: { type: "number" },
            status: { type: "string", enum: ["pending", "successful", "failed"] },
            created_at: { type: "string", format: "date-time" },
          },
        },
        Receipt: {
          type: "object",
          properties: {
            receiptNumber: { type: "string" },
            timestamp: { type: "string", format: "date-time" },
            storeName: { type: "string" },
            purchasedItems: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  quantity: { type: "integer" },
                  price: { type: "number" },
                },
              },
            },
            total: { type: "number" },
            paymentMethod: { type: "string" },
            transactionReference: { type: "string" },
          },
        },
      },
    },
  },
  apis: ["./src/routes/*.ts"],
};

export const swaggerSpec = swaggerJsdoc(options);
