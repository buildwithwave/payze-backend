import { Router } from "express";
import healthRoutes from "./health.routes";
import authRoutes from "./auth.routes";
import storeRoutes from "./store.routes";
import productRoutes from "./product.routes";
import checkoutRoutes from "./checkout.routes";
import paymentRoutes from "./payment.routes";
import receiptRoutes from "./receipt.routes";
import salesRoutes from "./sales.routes";
import invoiceRoutes from "./invoice.routes";
import metricsRoutes from "./metrics.routes";
import walletRoutes from "./wallet.routes";
import bankRoutes from "./bank.routes";
import transactionRoutes from "./transaction.routes";
import uploadRoutes from "./upload.routes";

const router: Router = Router();

router.use("/health", healthRoutes);
router.use("/auth", authRoutes);
router.use("/stores", storeRoutes);
router.use("/products", productRoutes);
router.use("/checkout", checkoutRoutes);
router.use("/payments", paymentRoutes);
router.use("/receipts", receiptRoutes);
router.use("/sales", salesRoutes);
router.use("/invoices", invoiceRoutes);
router.use("/metrics", metricsRoutes);
router.use("/wallet", walletRoutes);
router.use("/banks", bankRoutes);
router.use("/transactions", transactionRoutes);
router.use("/uploads", uploadRoutes);

export default router;
