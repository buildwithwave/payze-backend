import { Router } from "express";
import { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { requireAuth } from "../middlewares/auth.middleware";
import { upload } from "../middlewares/upload.middleware";
import { UploadService } from "../services/upload.service";

const router: Router = Router();

router.use(requireAuth);

/**
 * @swagger
 * /uploads:
 *   post:
 *     tags: [Uploads]
 *     summary: Upload an image, get back its URL (goes in product.image)
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *     responses:
 *       201:
 *         description: "`{ url }`"
 *       400:
 *         description: No file provided
 */
// upload.any(): the field name doesn't matter — "file", "image", whatever the frontend sends
router.post("/", upload.any(), async (req: Request, res: Response) => {
  const file = (req.files as Express.Multer.File[] | undefined)?.[0];
  if (!file) {
    return res.status(StatusCodes.BAD_REQUEST).json({ message: "No file provided" });
  }
  const url = await UploadService.uploadImage(file);
  res.status(StatusCodes.CREATED).json({ url });
});

export default router;
