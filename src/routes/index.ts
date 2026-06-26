import { Router } from "express";
import healthRoutes from "./health.routes";
import authRoutes from "./auth.routes";
import storeRoutes from "./store.routes";
import productRoutes from "./product.routes";
import checkoutRoutes from "./checkout.routes";
import paymentRoutes from "./payment.routes";
import receiptRoutes from "./receipt.routes";

const router: Router = Router();

router.use("/health", healthRoutes);
router.use("/auth", authRoutes);
router.use("/stores", storeRoutes);
router.use("/products", productRoutes);
router.use("/checkout", checkoutRoutes);
router.use("/payments", paymentRoutes);
router.use("/receipts", receiptRoutes);

export default router;
