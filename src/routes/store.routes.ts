import { Router } from "express";
import { StoreController } from "../controllers/store.controller";
import { requireAuth } from "../middlewares/auth.middleware";

const router: Router = Router();

router.use(requireAuth); // Protect all store routes

router.post("/", StoreController.createStore);
router.get("/:id", StoreController.getStore);
router.patch("/:id", StoreController.updateStore);

export default router;
