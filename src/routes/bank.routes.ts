import { Router } from "express";
import { WalletController } from "../controllers/wallet.controller";

const router: Router = Router();

/**
 * @swagger
 * /banks:
 *   get:
 *     tags: [Wallet]
 *     summary: List of banks for the withdraw form
 *     responses:
 *       200:
 *         description: "`[{ name, code }]`"
 */
router.get("/", WalletController.listBanks);

export default router;
