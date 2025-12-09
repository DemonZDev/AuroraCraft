import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import multer from 'multer';
import prisma from '../config/database.js';
import { authMiddleware } from '../middleware/auth.js';
import { createError } from '../middleware/errorHandler.js';
import * as fileService from '../services/file.js';
import { config } from '../config/env.js';

const router = Router();
router.use(authMiddleware);

// Configure multer for file uploads
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: config.storage.maxFileSizeMb * 1024 * 1024,
    },
});

const createFileSchema = z.object({
    path: z.string().min(1),
    content: z.string().default(''),
    isFolder: z.boolean().default(false),
});

const updateFileSchema = z.object({
    content: z.string(),
});

const renameFileSchema = z.object({
    newPath: z.string().min(1),
});

// Helper to verify session ownership
async function verifySessionOwnership(sessionId: string, userId: string) {
    const session = await prisma.session.findFirst({
        where: { id: sessionId, userId },
    });
    if (!session) {
        throw createError('Session not found', 404);
    }
    return session;
}

// Get file tree
router.get('/:sessionId', async (req: Request, res: Response, next: NextFunction) => {
    try {
        await verifySessionOwnership(req.params.sessionId, req.user!.id);
        const files = await fileService.getFileTree(req.params.sessionId);
        res.json({ files });
    } catch (error) {
        next(error);
    }
});

// Get file content
router.get('/:sessionId/file', async (req: Request, res: Response, next: NextFunction) => {
    try {
        await verifySessionOwnership(req.params.sessionId, req.user!.id);
        const filePath = req.query.path as string;

        if (!filePath) {
            throw createError('File path is required', 400);
        }

        const file = await fileService.getFile(req.params.sessionId, filePath);
        res.json({ file });
    } catch (error) {
        next(error);
    }
});

// Create file or folder
router.post('/:sessionId', async (req: Request, res: Response, next: NextFunction) => {
    try {
        await verifySessionOwnership(req.params.sessionId, req.user!.id);
        const data = createFileSchema.parse(req.body);

        const file = await fileService.createFile(
            req.params.sessionId,
            data.path,
            data.content,
            data.isFolder
        );

        res.status(201).json({ file });
    } catch (error) {
        next(error);
    }
});

// Update file content
router.put('/:sessionId/file', async (req: Request, res: Response, next: NextFunction) => {
    try {
        await verifySessionOwnership(req.params.sessionId, req.user!.id);
        const filePath = req.query.path as string;

        if (!filePath) {
            throw createError('File path is required', 400);
        }

        const data = updateFileSchema.parse(req.body);
        const file = await fileService.updateFile(req.params.sessionId, filePath, data.content);

        res.json({ file });
    } catch (error) {
        next(error);
    }
});

// Rename/move file
router.patch('/:sessionId/file', async (req: Request, res: Response, next: NextFunction) => {
    try {
        await verifySessionOwnership(req.params.sessionId, req.user!.id);
        const oldPath = req.query.path as string;

        if (!oldPath) {
            throw createError('File path is required', 400);
        }

        const data = renameFileSchema.parse(req.body);
        const file = await fileService.renameFile(req.params.sessionId, oldPath, data.newPath);

        res.json({ file });
    } catch (error) {
        next(error);
    }
});

// Delete file
router.delete('/:sessionId/file', async (req: Request, res: Response, next: NextFunction) => {
    try {
        await verifySessionOwnership(req.params.sessionId, req.user!.id);
        const filePath = req.query.path as string;

        if (!filePath) {
            throw createError('File path is required', 400);
        }

        await fileService.deleteFile(req.params.sessionId, filePath);
        res.json({ success: true });
    } catch (error) {
        next(error);
    }
});

// Upload ZIP
router.post('/:sessionId/upload', upload.single('file'), async (req: Request, res: Response, next: NextFunction) => {
    try {
        await verifySessionOwnership(req.params.sessionId, req.user!.id);

        if (!req.file) {
            throw createError('No file uploaded', 400);
        }

        if (!req.file.originalname.endsWith('.zip')) {
            throw createError('Only ZIP files are supported', 400);
        }

        const extractedFiles = await fileService.importFromZip(
            req.params.sessionId,
            req.file.buffer
        );

        res.json({
            success: true,
            filesImported: extractedFiles.length,
            files: extractedFiles,
        });
    } catch (error) {
        next(error);
    }
});

// Download as ZIP
router.get('/:sessionId/download', async (req: Request, res: Response, next: NextFunction) => {
    try {
        await verifySessionOwnership(req.params.sessionId, req.user!.id);

        const session = await prisma.session.findUnique({
            where: { id: req.params.sessionId },
            select: { name: true },
        });

        const zipBuffer = await fileService.exportToZip(req.params.sessionId);

        const filename = `${session?.name || 'project'}.zip`.replace(/[^a-zA-Z0-9-_.]/g, '_');

        res.setHeader('Content-Type', 'application/zip');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(zipBuffer);
    } catch (error) {
        next(error);
    }
});

// Download single file
router.get('/:sessionId/download/file', async (req: Request, res: Response, next: NextFunction) => {
    try {
        await verifySessionOwnership(req.params.sessionId, req.user!.id);
        const filePath = req.query.path as string;

        if (!filePath) {
            throw createError('File path is required', 400);
        }

        const file = await fileService.getFile(req.params.sessionId, filePath);

        res.setHeader('Content-Type', 'text/plain');
        res.setHeader('Content-Disposition', `attachment; filename="${file.name}"`);
        res.send(file.content);
    } catch (error) {
        next(error);
    }
});

export default router;
