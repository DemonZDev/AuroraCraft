import { Router, Request, Response, NextFunction } from 'express';
import { getVisibleModels } from '../services/ai/provider.js';
import { optionalAuthMiddleware } from '../middleware/auth.js';

const router = Router();

// Get all visible models (public endpoint)
router.get('/models', optionalAuthMiddleware, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const models = await getVisibleModels();
        res.json({ models });
    } catch (error) {
        next(error);
    }
});

export default router;
