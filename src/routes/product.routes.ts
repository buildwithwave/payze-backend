import { Router } from "express";
import { ProductController } from "../controllers/product.controller";
import { requireAuth } from "../middlewares/auth.middleware";

const router: Router = Router();

router.use(requireAuth);

router.post("/", ProductController.createProduct);
router.get("/", ProductController.getProducts);
router.get("/barcode/:barcode", ProductController.getProductByBarcode);
router.patch("/:id", ProductController.updateProduct);
router.delete("/:id", ProductController.deleteProduct);

export default router;
