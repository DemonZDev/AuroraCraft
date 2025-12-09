import fs from 'fs/promises';
import path from 'path';
import unzipper from 'unzipper';
import archiver from 'archiver';
import { createWriteStream, createReadStream } from 'fs';

export async function extractZip(zipPath: string, destPath: string): Promise<string[]> {
    const extractedFiles: string[] = [];

    await fs.mkdir(destPath, { recursive: true });

    return new Promise((resolve, reject) => {
        createReadStream(zipPath)
            .pipe(unzipper.Parse())
            .on('entry', async (entry) => {
                const filePath = path.join(destPath, entry.path);

                if (entry.type === 'Directory') {
                    await fs.mkdir(filePath, { recursive: true });
                    entry.autodrain();
                } else {
                    await fs.mkdir(path.dirname(filePath), { recursive: true });
                    entry.pipe(createWriteStream(filePath));
                    extractedFiles.push(entry.path);
                }
            })
            .on('close', () => resolve(extractedFiles))
            .on('error', reject);
    });
}

export async function createZip(sourceDir: string, destPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
        const output = createWriteStream(destPath);
        const archive = archiver('zip', { zlib: { level: 9 } });

        output.on('close', () => resolve());
        archive.on('error', reject);

        archive.pipe(output);
        archive.directory(sourceDir, false);
        archive.finalize();
    });
}

export async function ensureDir(dirPath: string): Promise<void> {
    await fs.mkdir(dirPath, { recursive: true });
}

export async function fileExists(filePath: string): Promise<boolean> {
    try {
        await fs.access(filePath);
        return true;
    } catch {
        return false;
    }
}

export async function safeDelete(filePath: string): Promise<void> {
    try {
        const stat = await fs.stat(filePath);
        if (stat.isDirectory()) {
            await fs.rm(filePath, { recursive: true });
        } else {
            await fs.unlink(filePath);
        }
    } catch {
        // Ignore if doesn't exist
    }
}
