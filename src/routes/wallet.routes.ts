import { Router } from "express";
import { WalletController } from "../controllers/wallet.controller";
import { requireAuth } from "../middlewares/auth.middleware";

const router: Router = Router();

router.use(requireAuth);

/**
 * @swagger
 * /wallet:
 *   get:
 *     tags: [Wallet]
 *     summary: Wallet balance and virtual account for receiving transfers
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: storeId
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: "`{ balance, currency, accountNumber, bankName, accountName }`"
 */
router.get("/", WalletController.getWallet);

/**
 * @swagger
 * /wallet/summary:
 *   get:
 *     tags: [Wallet]
 *     summary: Earnings summary with % change vs the previous period
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: storeId
 *         required: true
 *         schema: { type: string, format: uuid }
 *       - in: query
 *         name: period
 *         schema: { type: string, enum: [day, week, month], default: week }
 *     responses:
 *       200:
 *         description: "`{ total, changePercent, period }`"
 */
router.get("/summary", WalletController.getSummary);

/**
 * @swagger
 * /wallet/resolve-account:
 *   post:
 *     tags: [Wallet]
 *     summary: Name enquiry before a withdrawal
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [bankCode, accountNumber]
 *             properties:
 *               bankCode: { type: string }
 *               accountNumber: { type: string }
 *     responses:
 *       200:
 *         description: "`{ accountName }`"
 *       400:
 *         description: Could not resolve account name
 */
router.post("/resolve-account", WalletController.resolveAccount);

/**
 * @swagger
 * /wallet/withdraw:
 *   post:
 *     tags: [Wallet]
 *     summary: Withdraw from the wallet to a bank account
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [storeId, amount, bankCode, accountNumber]
 *             properties:
 *               storeId: { type: string, format: uuid }
 *               amount: { type: number }
 *               bankCode: { type: string }
 *               accountNumber: { type: string }
 *     responses:
 *       201:
 *         description: The created withdrawal transaction
 *       400:
 *         description: Insufficient balance / invalid details
 */
router.post("/withdraw", WalletController.withdraw);

export default router;
