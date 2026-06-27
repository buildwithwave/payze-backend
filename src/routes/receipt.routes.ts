import { Router } from "express";
import { ReceiptController } from "../controllers/receipt.controller";

const router: Router = Router();

/**
 * @swagger
 * /receipts/{id}:
 *   get:
 *     tags: [Receipts]
 *     summary: Get a receipt by ID
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Receipt details
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Receipt'
 *       404:
 *         description: Receipt not found
 */
router.get("/:id", ReceiptController.getReceipt);

export default router;
