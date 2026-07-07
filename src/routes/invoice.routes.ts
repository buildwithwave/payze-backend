import { Router } from "express";
import { InvoiceController } from "../controllers/invoice.controller";
import { requireAuth } from "../middlewares/auth.middleware";

const router: Router = Router();

/**
 * @swagger
 * /invoices/lookup/{code}:
 *   get:
 *     tags: [Invoices]
 *     summary: Public lookup — fetch an invoice by its number (e.g. INV-2507-0001)
 *     parameters:
 *       - in: path
 *         name: code
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Invoice details + store name
 *       404:
 *         description: Invoice not found
 */
router.get("/lookup/:code", InvoiceController.lookupByNumber);

/**
 * @swagger
 * /invoices/{id}/download:
 *   get:
 *     tags: [Invoices]
 *     summary: Public download — download a paid invoice receipt PDF
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Receipt PDF
 *         content:
 *           application/pdf:
 *             schema:
 *               type: string
 *               format: binary
 *       404:
 *         description: Paid invoice not found
 */
router.get("/:id/download", InvoiceController.downloadInvoice);

// All routes below require auth
router.use(requireAuth);

/**
 * @swagger
 * /invoices:
 *   get:
 *     tags: [Invoices]
 *     summary: List invoices for a store, newest first
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: storeId
 *         required: true
 *         schema: { type: string, format: uuid }
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *         description: Matches invoice number, customer name, and item names
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *     responses:
 *       200:
 *         description: Paginated invoices — `{ data, total, page, limit }`
 */
router.get("/", InvoiceController.listInvoices);

/**
 * @swagger
 * /invoices/{id}:
 *   get:
 *     tags: [Invoices]
 *     summary: Get a single invoice (receipt view)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Invoice details
 *       404:
 *         description: Invoice not found
 */
router.get("/:id", InvoiceController.getInvoice);

/**
 * @swagger
 * /invoices/{id}/send-receipt:
 *   post:
 *     tags: [Invoices]
 *     summary: Send receipt to customer via email or WhatsApp
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [channel, destination]
 *             properties:
 *               channel:
 *                 type: string
 *                 enum: [email, whatsapp]
 *               destination:
 *                 type: string
 *                 description: Email address or phone number
 *     responses:
 *       200:
 *         description: Receipt sent
 */
router.post("/:id/send-receipt", InvoiceController.sendReceipt);

export default router;
