import { Router } from "express";
import { TransactionController } from "../controllers/transaction.controller";
import { requireAuth } from "../middlewares/auth.middleware";

const router: Router = Router();

router.use(requireAuth);

/**
 * @swagger
 * /transactions:
 *   get:
 *     tags: [Wallet]
 *     summary: List wallet transactions (transfers in, POS card settlements, withdrawals)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: storeId
 *         required: true
 *         schema: { type: string, format: uuid }
 *       - in: query
 *         name: type
 *         schema: { type: string, enum: [credit, debit] }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *     responses:
 *       200:
 *         description: Paginated transactions — `{ data, total, page, limit }`
 */
router.get("/", TransactionController.listTransactions);

export default router;
