import { Router } from "express";
import { SalesController } from "../controllers/sales.controller";
import { requireAuth } from "../middlewares/auth.middleware";

const router: Router = Router();

router.use(requireAuth);

/**
 * @swagger
 * /sales/checkout:
 *   post:
 *     tags: [Sales]
 *     summary: Complete a POS sale (atomic — validates stock, decrements it, creates the invoice)
 *     description: Prices are computed server-side from the catalogue. Items snapshot name and price at sale time.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [storeId, items, paymentMethod]
 *             properties:
 *               storeId:
 *                 type: string
 *                 format: uuid
 *               items:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required: [productId, quantity]
 *                   properties:
 *                     productId: { type: string, format: uuid }
 *                     quantity: { type: integer, minimum: 1 }
 *               discount:
 *                 type: number
 *               paymentMethod:
 *                 type: string
 *                 enum: [cash, transfer, card]
 *               amountTendered:
 *                 type: number
 *                 description: Required when paymentMethod is cash
 *               customerName:
 *                 type: string
 *     responses:
 *       201:
 *         description: The created invoice
 *       400:
 *         description: Empty cart / invalid payment / amount tendered below total
 *       409:
 *         description: Insufficient stock
 */
router.post("/checkout", SalesController.checkout);

export default router;
