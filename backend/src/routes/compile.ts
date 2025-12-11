import { Router, Request, Response, NextFunction } from 'express';
import prisma from '../config/database.js';
import { authMiddleware } from '../middleware/auth.js';
import { createError } from '../middleware/errorHandler.js';
import * as compileService from '../services/compile.js';
import fs from 'fs/promises';

const router = Router();
router.use(authMiddleware);

// Helper to verify session ownership
async function verifySessionOwnership(sessionId: string, user: { id: string; role: string }) {
    if (user.role === 'ADMIN') {
        const session = await prisma.session.findFirst({
            where: { id: sessionId },
        });
        if (!session) {
            throw createError('Session not found', 404);
        }
        return session;
    }

    const session = await prisma.session.findFirst({
        where: { id: sessionId, userId: user.id },
    });
    if (!session) {
        throw createError('Session not found', 404);
    }
    return session;
}

// Start compilation
router.post('/:sessionId/compile', async (req: Request, res: Response, next: NextFunction) => {
    try {
        await verifySessionOwnership(req.params.sessionId, req.user!);
        const jobId = await compileService.startCompilation(req.params.sessionId);
        res.json({ jobId });
    } catch (error) {
        next(error);
    }
});

// Get compilation status
router.get('/:sessionId/status/:jobId', async (req: Request, res: Response, next: NextFunction) => {
    try {
        await verifySessionOwnership(req.params.sessionId, req.user!);
        const job = await compileService.getCompilationJob(req.params.jobId);

        if (job.sessionId !== req.params.sessionId) {
            throw createError('Job not found', 404);
        }

        res.json({ job });
    } catch (error) {
        next(error);
    }
});

// Get compilation history
router.get('/:sessionId/history', async (req: Request, res: Response, next: NextFunction) => {
    try {
        await verifySessionOwnership(req.params.sessionId, req.user!);
        const limit = parseInt(req.query.limit as string) || 20;
        const jobs = await compileService.getCompilationHistory(req.params.sessionId, limit);
        res.json({ jobs });
    } catch (error) {
        next(error);
    }
});

// Cancel compilation
router.post('/:sessionId/cancel/:jobId', async (req: Request, res: Response, next: NextFunction) => {
    try {
        await verifySessionOwnership(req.params.sessionId, req.user!);
        await compileService.cancelCompilation(req.params.jobId);
        res.json({ success: true });
    } catch (error) {
        next(error);
    }
});

// Download artifact
router.get('/:sessionId/download/:jobId', async (req: Request, res: Response, next: NextFunction) => {
    try {
        await verifySessionOwnership(req.params.sessionId, req.user!);
        const artifactPath = await compileService.getArtifactPath(req.params.jobId);

        const filename = artifactPath.split('/').pop() || 'plugin.jar';
        const fileBuffer = await fs.readFile(artifactPath);

        res.setHeader('Content-Type', 'application/java-archive');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(fileBuffer);
    } catch (error) {
        next(error);
    }
});

// Stream compilation logs (SSE)
router.get('/:sessionId/logs/:jobId', async (req: Request, res: Response, next: NextFunction) => {
    try {
        await verifySessionOwnership(req.params.sessionId, req.user!);

        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        let lastLogLength = 0;

        const sendLogs = async () => {
            try {
                const job = await prisma.compilationJob.findUnique({
                    where: { id: req.params.jobId },
                    select: { logs: true, status: true, errorLogs: true },
                });

                if (!job) {
                    res.write(`data: ${JSON.stringify({ error: 'Job not found' })}\n\n`);
                    res.end();
                    return;
                }

                // Send new log content
                if (job.logs.length > lastLogLength) {
                    const newLogs = job.logs.slice(lastLogLength);
                    lastLogLength = job.logs.length;
                    res.write(`data: ${JSON.stringify({ logs: newLogs })}\n\n`);
                }

                // Check if job is complete
                if (job.status === 'SUCCESS' || job.status === 'FAILED' || job.status === 'CANCELLED') {
                    res.write(`data: ${JSON.stringify({
                        done: true,
                        status: job.status,
                        errorLogs: job.errorLogs
                    })}\n\n`);
                    res.end();
                    return;
                }

                // Continue polling
                setTimeout(sendLogs, 500);
            } catch (error) {
                res.write(`data: ${JSON.stringify({ error: 'Failed to fetch logs' })}\n\n`);
                res.end();
            }
        };

        sendLogs();

        // Clean up on client disconnect
        req.on('close', () => {
            res.end();
        });
    } catch (error) {
        if (!res.headersSent) {
            next(error);
        }
    }
});

export default router;
