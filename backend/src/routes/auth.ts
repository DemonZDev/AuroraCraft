import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import * as authService from '../services/auth.js';
import { authMiddleware } from '../middleware/auth.js';
import { config } from '../config/env.js';

const router = Router();

const registerSchema = z.object({
    username: z.string().min(3).max(30).regex(/^[a-zA-Z0-9_]+$/, 'Username can only contain letters, numbers, and underscores'),
    email: z.string().email(),
    password: z.string().min(8),
    confirmPassword: z.string(),
});

const loginSchema = z.object({
    email: z.string().email(),
    password: z.string(),
});

// Cookie options
const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    path: '/',
};

// Register
router.post('/register', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const data = registerSchema.parse(req.body);
        const result = await authService.register(data);

        res.cookie('token', result.token, cookieOptions);
        res.json({
            success: true,
            user: result.user,
        });
    } catch (error) {
        next(error);
    }
});

// Login
router.post('/login', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const data = loginSchema.parse(req.body);
        const result = await authService.login(data);

        res.cookie('token', result.token, cookieOptions);
        res.json({
            success: true,
            user: result.user,
        });
    } catch (error) {
        next(error);
    }
});

// Logout
router.post('/logout', (req: Request, res: Response) => {
    res.clearCookie('token', { path: '/' });
    res.json({ success: true });
});

// Get current user
router.get('/me', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const user = await authService.getCurrentUser(req.user!.id);
        res.json({ user });
    } catch (error) {
        next(error);
    }
});

// Refresh token (extends session)
router.post('/refresh', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const user = await authService.getCurrentUser(req.user!.id);
        const token = await authService.login({ email: user.email, password: '' }).catch(() => null);

        // Just return current user, token is already valid
        res.json({ user });
    } catch (error) {
        next(error);
    }
});

export default router;
