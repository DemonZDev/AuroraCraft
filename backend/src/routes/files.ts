import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../lib/prisma.js';
import { config } from '../config.js';
import { hashString } from '../lib/encryption.js';
import path from 'path';
import fs from 'fs/promises';
import archiver from 'archiver';

// Helper to validate path (prevent traversal)
function validatePath(basePath: string, filePath: string): string {
    const resolved = path.resolve(basePath, filePath);
    if (!resolved.startsWith(path.resolve(basePath))) {
        throw new Error('Invalid path: directory traversal detected');
    }
    return resolved;
}

// Helper to check allowed extensions
function isAllowedExtension(filePath: string): boolean {
    const ext = path.extname(filePath).toLowerCase();
    return config.allowedExtensions.includes(ext) || ext === '';
}

// Recursively get file tree
async function getFileTree(dirPath: string, basePath: string): Promise<any[]> {
    const entries: any[] = [];

    try {
        const items = await fs.readdir(dirPath, { withFileTypes: true });

        for (const item of items) {
            const fullPath = path.join(dirPath, item.name);
            const relativePath = path.relative(basePath, fullPath).replace(/\\/g, '/');

            if (item.isDirectory()) {
                const children = await getFileTree(fullPath, basePath);
                entries.push({
                    name: item.name,
                    path: relativePath,
                    type: 'folder',
                    children,
                });
            } else {
                const stats = await fs.stat(fullPath);
                entries.push({
                    name: item.name,
                    path: relativePath,
                    type: 'file',
                    size: stats.size,
                    lastModified: stats.mtime.toISOString(),
                });
            }
        }
    } catch (e) {
        // Directory doesn't exist or not readable
    }

    return entries.sort((a, b) => {
        if (a.type === b.type) return a.name.localeCompare(b.name);
        return a.type === 'folder' ? -1 : 1;
    });
}

export async function fileRoutes(app: FastifyInstance) {

    // List files in session
    app.get('/:id/files', {
        onRequest: [(app as any).authenticate],
        schema: {
            description: 'List all files in session workspace',
            tags: ['Files'],
            security: [{ cookieAuth: [] }],
        },
    }, async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
        const user = (request as any).user;
        const { id } = request.params;

        const session = await prisma.session.findFirst({
            where: { id, ownerId: user.id },
        });

        if (!session) {
            return reply.status(404).send({ error: 'Session not found' });
        }

        const files = await getFileTree(session.workspacePath, session.workspacePath);
        return { files };
    });

    // Read file content
    app.get('/:id/files/*', {
        onRequest: [(app as any).authenticate],
        schema: {
            description: 'Read file content',
            tags: ['Files'],
            security: [{ cookieAuth: [] }],
        },
    }, async (request: FastifyRequest<{ Params: { id: string; '*': string } }>, reply: FastifyReply) => {
        const user = (request as any).user;
        const { id } = request.params;
        const filePath = request.params['*'];

        if (!filePath) {
            return reply.status(400).send({ error: 'File path required' });
        }

        const session = await prisma.session.findFirst({
            where: { id, ownerId: user.id },
        });

        if (!session) {
            return reply.status(404).send({ error: 'Session not found' });
        }

        try {
            const fullPath = validatePath(session.workspacePath, filePath);
            const content = await fs.readFile(fullPath, 'utf-8');
            const stats = await fs.stat(fullPath);

            return {
                path: filePath,
                content,
                size: stats.size,
                lastModified: stats.mtime.toISOString(),
            };
        } catch (e) {
            return reply.status(404).send({ error: 'File not found' });
        }
    });

    // Write file content
    app.put('/:id/files/*', {
        onRequest: [(app as any).authenticate],
        schema: {
            description: 'Write/create file',
            tags: ['Files'],
            security: [{ cookieAuth: [] }],
        },
    }, async (request: FastifyRequest<{ Params: { id: string; '*': string } }>, reply: FastifyReply) => {
        const user = (request as any).user;
        const { id } = request.params;
        const filePath = request.params['*'];
        const { content } = request.body as { content: string };

        if (!filePath) {
            return reply.status(400).send({ error: 'File path required' });
        }

        if (!isAllowedExtension(filePath)) {
            return reply.status(400).send({ error: 'File extension not allowed' });
        }

        const session = await prisma.session.findFirst({
            where: { id, ownerId: user.id },
        });

        if (!session) {
            return reply.status(404).send({ error: 'Session not found' });
        }

        try {
            const fullPath = validatePath(session.workspacePath, filePath);
            const dir = path.dirname(fullPath);

            // Create directory if needed
            await fs.mkdir(dir, { recursive: true });

            // Atomic write: write to temp file, then rename
            const tempPath = fullPath + '.tmp';
            await fs.writeFile(tempPath, content, 'utf-8');
            await fs.rename(tempPath, fullPath);

            const stats = await fs.stat(fullPath);

            // Update or create file index
            await prisma.fileIndex.upsert({
                where: {
                    sessionId_path: {
                        sessionId: id,
                        path: filePath,
                    },
                },
                update: {
                    size: stats.size,
                    checksum: hashString(content),
                    lastModifiedBy: user.id,
                    lastModifiedAt: new Date(),
                },
                create: {
                    sessionId: id,
                    path: filePath,
                    size: stats.size,
                    checksum: hashString(content),
                    lastModifiedBy: user.id,
                },
            });

            // Update session timestamp
            await prisma.session.update({
                where: { id },
                data: { updatedAt: new Date() },
            });

            return {
                path: filePath,
                size: stats.size,
                lastModified: stats.mtime.toISOString(),
            };
        } catch (e: any) {
            return reply.status(500).send({ error: e.message });
        }
    });

    // Delete file
    app.delete('/:id/files/*', {
        onRequest: [(app as any).authenticate],
        schema: {
            description: 'Delete file (soft delete to .trash)',
            tags: ['Files'],
            security: [{ cookieAuth: [] }],
        },
    }, async (request: FastifyRequest<{ Params: { id: string; '*': string } }>, reply: FastifyReply) => {
        const user = (request as any).user;
        const { id } = request.params;
        const filePath = request.params['*'];

        if (!filePath) {
            return reply.status(400).send({ error: 'File path required' });
        }

        const session = await prisma.session.findFirst({
            where: { id, ownerId: user.id },
        });

        if (!session) {
            return reply.status(404).send({ error: 'Session not found' });
        }

        try {
            const fullPath = validatePath(session.workspacePath, filePath);

            // Soft delete: move to .trash folder
            const trashPath = path.join(session.workspacePath, '.trash');
            await fs.mkdir(trashPath, { recursive: true });

            const trashFilePath = path.join(trashPath, `${Date.now()}_${path.basename(filePath)}`);
            await fs.rename(fullPath, trashFilePath);

            // Mark as deleted in index
            await prisma.fileIndex.updateMany({
                where: { sessionId: id, path: filePath },
                data: { isDeleted: true, deletedAt: new Date() },
            });

            return { success: true };
        } catch (e: any) {
            return reply.status(500).send({ error: e.message });
        }
    });

    // Download workspace as ZIP
    app.get('/:id/files/download-zip', {
        onRequest: [(app as any).authenticate],
        schema: {
            description: 'Download entire workspace as ZIP',
            tags: ['Files'],
            security: [{ cookieAuth: [] }],
        },
    }, async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
        const user = (request as any).user;
        const { id } = request.params;

        const session = await prisma.session.findFirst({
            where: { id, ownerId: user.id },
        });

        if (!session) {
            return reply.status(404).send({ error: 'Session not found' });
        }

        const archive = archiver('zip', { zlib: { level: 9 } });

        reply.header('Content-Type', 'application/zip');
        reply.header('Content-Disposition', `attachment; filename="${session.title.replace(/[^a-z0-9]/gi, '_')}.zip"`);

        archive.directory(session.workspacePath, false);
        archive.finalize();

        return reply.send(archive);
    });

    // Create folder
    app.post('/:id/files/folder', {
        onRequest: [(app as any).authenticate],
        schema: {
            description: 'Create a new folder',
            tags: ['Files'],
            security: [{ cookieAuth: [] }],
        },
    }, async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
        const user = (request as any).user;
        const { id } = request.params;
        const { path: folderPath } = request.body as { path: string };

        if (!folderPath) {
            return reply.status(400).send({ error: 'Folder path required' });
        }

        const session = await prisma.session.findFirst({
            where: { id, ownerId: user.id },
        });

        if (!session) {
            return reply.status(404).send({ error: 'Session not found' });
        }

        try {
            const fullPath = validatePath(session.workspacePath, folderPath);
            await fs.mkdir(fullPath, { recursive: true });
            return { success: true, path: folderPath };
        } catch (e: any) {
            return reply.status(500).send({ error: e.message });
        }
    });
}
