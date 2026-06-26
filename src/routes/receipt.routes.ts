import { Router } from "express";
import { ReceiptController } from "../controllers/receipt.controller";

const router: Router = Router();

// Receipts can be public or authenticated, assuming authenticated here or publicly accessible by link
router.get("/:id", ReceiptController.getReceipt);

export default router;
