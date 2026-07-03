import { Router } from "express";
import { MetricsController } from "../controllers/metrics.controller";
import { requireAuth } from "../middlewares/auth.middleware";

const router: Router = Router();

router.use(requireAuth);

/**
 * @swagger
 * /metrics/overview:
 *   get:
 *     tags: [Metrics]
 *     summary: Dashboard stat cards (products, orders, stores, invoices)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: storeId
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Counts for the four stat cards
 */
router.get("/overview", MetricsController.getOverview);

/**
 * @swagger
 * /metrics/sales-trend:
 *   get:
 *     tags: [Metrics]
 *     summary: Sales line chart data
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: storeId
 *         required: true
 *         schema: { type: string, format: uuid }
 *       - in: query
 *         name: range
 *         schema: { type: string, enum: [7D, 1M, 3M, 6M, 1Y], default: 1Y }
 *     responses:
 *       200:
 *         description: "`{ range, points: [{ label, date, sales }] }` — daily buckets for 7D/1M, monthly for 3M/6M/1Y"
 */
router.get("/sales-trend", MetricsController.getSalesTrend);

export default router;
