import { Router } from "express";
import { StatusCodes } from "http-status-codes";
import { NombaService } from "../services/nomba.service";
import { requireInternalKey } from "../middlewares/auth.middleware";

const router: Router = Router();

router.use(requireInternalKey);

/**
 * @swagger
 * /internal/nomba-balance:
 *   get:
 *     tags: [Internal]
 *     summary: Cumulative Nomba parent account balance (all stores combined)
 *     description: Admin/internal use only — gated by x-internal-key header, not user auth.
 *     security:
 *       - internalKey: []
 *     responses:
 *       200:
 *         description: "`{ amount, currency }`"
 *       401:
 *         description: Missing or invalid x-internal-key header
 */
router.get("/nomba-balance", async (_req, res) => {
  const balance = await NombaService.getAccountBalance();
  res.status(StatusCodes.OK).json(balance);
});

export default router;
