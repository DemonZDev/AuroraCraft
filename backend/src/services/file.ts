import prisma from '../config/database.js';
import { createError } from '../middleware/errorHandler.js';
import { config } from '../config/env.js';
import path from 'path';
import fs from 'fs/promises';
import { extractZip, createZip, ensureDir, fileExists, safeDelete } from '../utils/zip.js';

// Get the storage path for a session
function getSessionStoragePath(sessionId: string): string {
    return path.join(config.storage.path, 'sessions', sessionId);
}

export async function createFile(
    sessionId: string,
    filePath: string,
    content: string,
    isFolder: boolean = false
): Promise<any> {
    // Normalize path
    const normalizedPath = filePath.replace(/\\/g, '/').replace(/^\//, '');
    const fileName = path.basename(normalizedPath);

    // Check if file already exists
    const existing = await prisma.sessionFile.findUnique({
        where: {
            sessionId_path: { sessionId, path: normalizedPath },
        },
    });

    if (existing) {
        throw createError('File already exists', 400);
    }

    // Create parent folders if they don't exist
    const parts = normalizedPath.split('/');
    let currentPath = '';
    for (let i = 0; i < parts.length - 1; i++) {
        currentPath = currentPath ? `${currentPath}/${parts[i]}` : parts[i];

        const folderExists = await prisma.sessionFile.findUnique({
            where: { sessionId_path: { sessionId, path: currentPath } },
        });

        if (!folderExists) {
            await prisma.sessionFile.create({
                data: {
                    sessionId,
                    path: currentPath,
                    name: parts[i],
                    content: '',
                    isFolder: true,
                },
            });
        }
    }

    // Create the file
    const file = await prisma.sessionFile.create({
        data: {
            sessionId,
            path: normalizedPath,
            name: fileName,
            content: isFolder ? '' : content,
            isFolder,
        },
    });

    return file;
}

export async function updateFile(
    sessionId: string,
    filePath: string,
    content: string
): Promise<any> {
    const normalizedPath = filePath.replace(/\\/g, '/').replace(/^\//, '');

    const file = await prisma.sessionFile.findUnique({
        where: { sessionId_path: { sessionId, path: normalizedPath } },
    });

    if (!file) {
        throw createError('File not found', 404);
    }

    if (file.isFolder) {
        throw createError('Cannot update folder content', 400);
    }

    return prisma.sessionFile.update({
        where: { id: file.id },
        data: { content },
    });
}

export async function deleteFile(sessionId: string, filePath: string): Promise<void> {
    const normalizedPath = filePath.replace(/\\/g, '/').replace(/^\//, '');

    const file = await prisma.sessionFile.findUnique({
        where: { sessionId_path: { sessionId, path: normalizedPath } },
    });

    if (!file) {
        throw createError('File not found', 404);
    }

    // If it's a folder, delete all children first
    if (file.isFolder) {
        await prisma.sessionFile.deleteMany({
            where: {
                sessionId,
                path: { startsWith: normalizedPath + '/' },
            },
        });
    }

    await prisma.sessionFile.delete({ where: { id: file.id } });
}

export async function renameFile(
    sessionId: string,
    oldPath: string,
    newPath: string
): Promise<any> {
    const normalizedOldPath = oldPath.replace(/\\/g, '/').replace(/^\//, '');
    const normalizedNewPath = newPath.replace(/\\/g, '/').replace(/^\//, '');
    const newName = path.basename(normalizedNewPath);

    const file = await prisma.sessionFile.findUnique({
        where: { sessionId_path: { sessionId, path: normalizedOldPath } },
    });

    if (!file) {
        throw createError('File not found', 404);
    }

    // Check if new path already exists
    const existingAtNewPath = await prisma.sessionFile.findUnique({
        where: { sessionId_path: { sessionId, path: normalizedNewPath } },
    });

    if (existingAtNewPath) {
        throw createError('A file already exists at the destination path', 400);
    }

    // If it's a folder, update all children paths
    if (file.isFolder) {
        const children = await prisma.sessionFile.findMany({
            where: {
                sessionId,
                path: { startsWith: normalizedOldPath + '/' },
            },
        });

        for (const child of children) {
            const newChildPath = child.path.replace(normalizedOldPath, normalizedNewPath);
            await prisma.sessionFile.update({
                where: { id: child.id },
                data: { path: newChildPath },
            });
        }
    }

    return prisma.sessionFile.update({
        where: { id: file.id },
        data: { path: normalizedNewPath, name: newName },
    });
}

export async function getFile(sessionId: string, filePath: string): Promise<any> {
    const normalizedPath = filePath.replace(/\\/g, '/').replace(/^\//, '');

    const file = await prisma.sessionFile.findUnique({
        where: { sessionId_path: { sessionId, path: normalizedPath } },
    });

    if (!file) {
        throw createError('File not found', 404);
    }

    return file;
}

export async function getFileTree(sessionId: string): Promise<any[]> {
    const files = await prisma.sessionFile.findMany({
        where: { sessionId },
        orderBy: [{ isFolder: 'desc' }, { path: 'asc' }],
        select: {
            id: true,
            path: true,
            name: true,
            isFolder: true,
            updatedAt: true,
        },
    });

    return files;
}

export async function importFromZip(
    sessionId: string,
    zipBuffer: Buffer
): Promise<string[]> {
    const tempDir = path.join(config.storage.path, 'temp', sessionId);
    const zipPath = path.join(tempDir, 'upload.zip');

    try {
        await ensureDir(tempDir);
        await fs.writeFile(zipPath, zipBuffer);

        const extractedFiles = await extractZip(zipPath, tempDir);

        // Import each file to the database
        for (const filePath of extractedFiles) {
            const fullPath = path.join(tempDir, filePath);
            const stat = await fs.stat(fullPath);

            if (!stat.isDirectory()) {
                const content = await fs.readFile(fullPath, 'utf-8');
                try {
                    await createFile(sessionId, filePath, content, false);
                } catch (e) {
                    // Skip if file already exists
                }
            }
        }

        return extractedFiles;
    } finally {
        await safeDelete(tempDir);
    }
}

export async function exportToZip(sessionId: string): Promise<Buffer> {
    const files = await prisma.sessionFile.findMany({
        where: { sessionId, isFolder: false },
        select: { path: true, content: true },
    });

    const tempDir = path.join(config.storage.path, 'temp', `export-${sessionId}`);
    const zipPath = path.join(tempDir, 'project.zip');

    try {
        await ensureDir(tempDir);

        // Write all files to temp directory
        for (const file of files) {
            const filePath = path.join(tempDir, 'project', file.path);
            await ensureDir(path.dirname(filePath));
            await fs.writeFile(filePath, file.content);
        }

        // Create zip
        await createZip(path.join(tempDir, 'project'), zipPath);
        const zipBuffer = await fs.readFile(zipPath);

        return zipBuffer;
    } finally {
        await safeDelete(tempDir);
    }
}
