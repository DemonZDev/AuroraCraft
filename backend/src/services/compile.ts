import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs/promises';
import prisma from '../config/database.js';
import { config } from '../config/env.js';
import { createError } from '../middleware/errorHandler.js';
import { ensureDir, safeDelete } from '../utils/zip.js';
import { CompilationStatus } from '@prisma/client';

interface CompilationResult {
    success: boolean;
    logs: string;
    errorLogs?: string;
    artifactPath?: string;
}

export async function startCompilation(sessionId: string): Promise<string> {
    // Check if there's already a running compilation
    const runningJob = await prisma.compilationJob.findFirst({
        where: {
            sessionId,
            status: { in: ['PENDING', 'RUNNING'] },
        },
    });

    if (runningJob) {
        throw createError('A compilation is already in progress', 400);
    }

    // Create a new job
    const job = await prisma.compilationJob.create({
        data: {
            sessionId,
            status: 'PENDING',
        },
    });

    // Start compilation in background
    runCompilation(job.id, sessionId).catch(console.error);

    return job.id;
}

async function runCompilation(jobId: string, sessionId: string): Promise<void> {
    const buildDir = path.join(config.storage.path, 'builds', jobId);
    const artifactsDir = path.join(config.storage.path, 'artifacts', sessionId);

    try {
        // Update job to running
        await prisma.compilationJob.update({
            where: { id: jobId },
            data: { status: 'RUNNING', startedAt: new Date() },
        });

        await ensureDir(buildDir);
        await ensureDir(artifactsDir);

        // Get all session files
        const files = await prisma.sessionFile.findMany({
            where: { sessionId, isFolder: false },
            select: { path: true, content: true },
        });

        // Write files to build directory
        for (const file of files) {
            const filePath = path.join(buildDir, file.path);
            await ensureDir(path.dirname(filePath));
            await fs.writeFile(filePath, file.content);
        }

        // Check if pom.xml exists
        const pomExists = files.some(f => f.path === 'pom.xml' || f.path.endsWith('/pom.xml'));
        if (!pomExists) {
            throw new Error('No pom.xml found in project. Maven build requires a pom.xml file.');
        }

        // Run Maven build
        const result = await runMaven(buildDir, jobId);

        if (result.success) {
            // Find the built JAR
            const targetDir = path.join(buildDir, 'target');
            try {
                const targetFiles = await fs.readdir(targetDir);
                const jarFile = targetFiles.find(f => f.endsWith('.jar') && !f.includes('-sources') && !f.includes('-javadoc'));

                if (jarFile) {
                    const artifactPath = path.join(artifactsDir, jarFile);
                    await fs.copyFile(path.join(targetDir, jarFile), artifactPath);

                    await prisma.compilationJob.update({
                        where: { id: jobId },
                        data: {
                            status: 'SUCCESS',
                            logs: result.logs,
                            artifactPath,
                            completedAt: new Date(),
                        },
                    });
                } else {
                    await prisma.compilationJob.update({
                        where: { id: jobId },
                        data: {
                            status: 'SUCCESS',
                            logs: result.logs + '\n\nNote: Build succeeded but no JAR file was found in target directory.',
                            completedAt: new Date(),
                        },
                    });
                }
            } catch {
                await prisma.compilationJob.update({
                    where: { id: jobId },
                    data: {
                        status: 'SUCCESS',
                        logs: result.logs,
                        completedAt: new Date(),
                    },
                });
            }
        } else {
            await prisma.compilationJob.update({
                where: { id: jobId },
                data: {
                    status: 'FAILED',
                    logs: result.logs,
                    errorLogs: result.errorLogs,
                    completedAt: new Date(),
                },
            });
        }
    } catch (error: any) {
        await prisma.compilationJob.update({
            where: { id: jobId },
            data: {
                status: 'FAILED',
                logs: '',
                errorLogs: error.message || 'Unknown error occurred',
                completedAt: new Date(),
            },
        });
    } finally {
        // Clean up build directory
        await safeDelete(buildDir);
    }
}

function runMaven(buildDir: string, jobId: string): Promise<CompilationResult> {
    return new Promise((resolve) => {
        const env = {
            ...process.env,
            JAVA_HOME: config.compilation.javaHome,
            MAVEN_HOME: config.compilation.mavenHome,
            PATH: `${config.compilation.mavenHome}/bin:${config.compilation.javaHome}/bin:${process.env.PATH}`,
        };

        const mvn = spawn('mvn', ['clean', 'package', '-DskipTests', '-B'], {
            cwd: buildDir,
            env,
            shell: true,
        });

        let stdout = '';
        let stderr = '';

        mvn.stdout.on('data', async (data) => {
            const text = data.toString();
            stdout += text;

            // Update logs in real-time
            try {
                await prisma.compilationJob.update({
                    where: { id: jobId },
                    data: { logs: stdout },
                });
            } catch {
                // Ignore update errors
            }
        });

        mvn.stderr.on('data', (data) => {
            stderr += data.toString();
        });

        // Set timeout
        const timeout = setTimeout(() => {
            mvn.kill();
            resolve({
                success: false,
                logs: stdout,
                errorLogs: 'Compilation timed out',
            });
        }, config.compilation.timeoutMs);

        mvn.on('close', (code) => {
            clearTimeout(timeout);
            resolve({
                success: code === 0,
                logs: stdout,
                errorLogs: code !== 0 ? stderr || stdout : undefined,
            });
        });

        mvn.on('error', (error) => {
            clearTimeout(timeout);
            resolve({
                success: false,
                logs: stdout,
                errorLogs: error.message,
            });
        });
    });
}

export async function getCompilationJob(jobId: string) {
    const job = await prisma.compilationJob.findUnique({
        where: { id: jobId },
    });

    if (!job) {
        throw createError('Compilation job not found', 404);
    }

    return job;
}

export async function getCompilationHistory(sessionId: string, limit: number = 20) {
    return prisma.compilationJob.findMany({
        where: { sessionId },
        orderBy: { createdAt: 'desc' },
        take: limit,
    });
}

export async function cancelCompilation(jobId: string): Promise<void> {
    const job = await prisma.compilationJob.findUnique({
        where: { id: jobId },
    });

    if (!job) {
        throw createError('Compilation job not found', 404);
    }

    if (job.status !== 'PENDING' && job.status !== 'RUNNING') {
        throw createError('Cannot cancel completed job', 400);
    }

    await prisma.compilationJob.update({
        where: { id: jobId },
        data: { status: 'CANCELLED', completedAt: new Date() },
    });
}

export async function getArtifactPath(jobId: string): Promise<string> {
    const job = await prisma.compilationJob.findUnique({
        where: { id: jobId },
    });

    if (!job) {
        throw createError('Compilation job not found', 404);
    }

    if (job.status !== 'SUCCESS' || !job.artifactPath) {
        throw createError('No artifact available', 404);
    }

    return job.artifactPath;
}
