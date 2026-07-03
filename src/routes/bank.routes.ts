import { Router } from "express";
import { WalletController } from "../controllers/wallet.controller";
import { requireAuth } from "../middlewares/auth.middleware";

const router: Router = Router();

router.use(requireAuth);

/**
 * @swagger
 * /banks:
 *   get:
 *     tags: [Wallet]
 *     summary: List of banks for the withdraw form
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: "`[{ name, code }]`"
 */
router.get("/", WalletController.listBanks);

export default router;
