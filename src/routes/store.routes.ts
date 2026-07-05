import { Router } from "express";
import { StoreController } from "../controllers/store.controller";
import { requireAuth } from "../middlewares/auth.middleware";

const router: Router = Router();

/**
 * @swagger
 * /stores/public:
 *   get:
 *     tags: [Stores]
 *     summary: List all stores publicly
 *     responses:
 *       200:
 *         description: List of public stores
 */
router.get("/public", StoreController.listPublicStores);

router.use(requireAuth);

/**
 * @swagger
 * /stores:
 *   post:
 *     tags: [Stores]
 *     summary: Create a new store
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name:
 *                 type: string
 *     responses:
 *       201:
 *         description: Store created
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Store'
 */
router.post("/", StoreController.createStore);

/**
 * @swagger
 * /stores:
 *   get:
 *     tags: [Stores]
 *     summary: List the authenticated user's stores
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of stores
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Store'
 */
router.get("/", StoreController.listStores);

/**
 * @swagger
 * /stores/{id}:
 *   get:
 *     tags: [Stores]
 *     summary: Get a store by ID
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Store details
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Store'
 */
router.get("/:id", StoreController.getStore);

/**
 * @swagger
 * /stores/{id}:
 *   patch:
 *     tags: [Stores]
 *     summary: Update a store
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *     responses:
 *       200:
 *         description: Store updated
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Store'
 */
router.patch("/:id", StoreController.updateStore);

export default router;
