import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';

const startCompileSchema = z.object({
    mavenArgs: z.array(z.string()).optional().default(['clean', 'package']),
    javaVersion: z.string().optional().default('21'),
});

// Compile job contract for future worker implementation
interface CompileJobPayload {
    jobId: string;
    sessionId: string;
    workspacePath: string;
    javaVersion: string;
    mavenArgs: string[];
    targetPlatform: string;
    targetVersion: string;
    timeout: number;
    memoryLimit: string;
    createdAt: string;
}

export async function compileRoutes(app: FastifyInstance) {

    // Start compilation (stub - queues job)
    app.post('/:id/compile', {
        onRequest: [(app as any).authenticate],
        schema: {
            description: 'Start compilation job',
            tags: ['Compile'],
            security: [{ cookieAuth: [] }],
        },
    }, async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
        const user = (request as any).user;
        const { id } = request.params;
        const body = startCompileSchema.parse(request.body || {});

        const session = await prisma.session.findFirst({
            where: { id, ownerId: user.id },
        });

        if (!session) {
            return reply.status(404).send({ error: 'Session not found' });
        }

        // Create compile job
        const job = await prisma.compileJob.create({
            data: {
                sessionId: id,
                status: 'QUEUED',
                mavenArgs: body.mavenArgs,
                javaVersion: body.javaVersion,
            },
        });

        // Generate job payload for worker (would be sent to Redis/queue in production)
        const payload: CompileJobPayload = {
            jobId: job.id,
            sessionId: session.id,
            workspacePath: session.workspacePath,
            javaVersion: body.javaVersion,
            mavenArgs: body.mavenArgs,
            targetPlatform: session.targetSoftware,
            targetVersion: session.targetVersion,
            timeout: 300,
            memoryLimit: '2g',
            createdAt: new Date().toISOString(),
        };

        // Log the job (in production, this would go to a queue)
        await prisma.log.create({
            data: {
                type: 'COMPILE',
                action: 'queued',
                userId: user.id,
                sessionId: id,
                payload: payload,
            },
        });

        return reply.status(202).send({
            job: {
                id: job.id,
                status: job.status,
                createdAt: job.createdAt,
            },
            message: 'Compilation job queued',
            // Include payload for debugging/documentation
            _workerPayload: payload,
        });
    });

    // Get compile job status
    app.get('/:id/compile/:jobId', {
        onRequest: [(app as any).authenticate],
        schema: {
            description: 'Get compile job status and logs',
            tags: ['Compile'],
            security: [{ cookieAuth: [] }],
        },
    }, async (request: FastifyRequest<{ Params: { id: string; jobId: string } }>, reply: FastifyReply) => {
        const user = (request as any).user;
        const { id, jobId } = request.params;

        const session = await prisma.session.findFirst({
            where: { id, ownerId: user.id },
        });

        if (!session) {
            return reply.status(404).send({ error: 'Session not found' });
        }

        const job = await prisma.compileJob.findFirst({
            where: { id: jobId, sessionId: id },
        });

        if (!job) {
            return reply.status(404).send({ error: 'Compile job not found' });
        }

        // Simulate log content for stub
        const mockLogs = job.status === 'QUEUED' ? [
            '[INFO] Job queued, waiting for compile worker...',
            '[INFO] Compile worker not yet implemented.',
            '[INFO] See COMPILE_WORKER.md for implementation guide.',
        ] : job.status === 'RUNNING' ? [
            '[INFO] Compilation in progress...',
            '[INFO] Resolving dependencies...',
        ] : job.status === 'SUCCESS' ? [
            '[INFO] Build completed successfully!',
            '[INFO] Artifact: target/plugin-1.0.0.jar',
        ] : [
            '[ERROR] Build failed',
            '[ERROR] See COMPILE_WORKER.md for troubleshooting',
        ];

        return {
            job: {
                id: job.id,
                status: job.status,
                mavenArgs: job.mavenArgs,
                javaVersion: job.javaVersion,
                startedAt: job.startedAt,
                finishedAt: job.finishedAt,
                errorMessage: job.errorMessage,
                artifactPath: job.artifactPath,
                createdAt: job.createdAt,
            },
            logs: mockLogs,
        };
    });

    // Stream compile logs (SSE stub)
    app.get('/:id/compile/:jobId/logs', {
        onRequest: [(app as any).authenticate],
        schema: {
            description: 'Stream compile logs via SSE',
            tags: ['Compile'],
            security: [{ cookieAuth: [] }],
        },
    }, async (request: FastifyRequest<{ Params: { id: string; jobId: string } }>, reply: FastifyReply) => {
        const user = (request as any).user;
        const { id, jobId } = request.params;

        reply.raw.setHeader('Content-Type', 'text/event-stream');
        reply.raw.setHeader('Cache-Control', 'no-cache');
        reply.raw.setHeader('Connection', 'keep-alive');

        // Simulate streaming logs
        const mockLogs = [
            '[INFO] Compile worker not yet implemented',
            '[INFO] This is a stub endpoint',
            '[INFO] See backend/docs/COMPILE_WORKER.md for implementation',
            '[DONE] Stream ended',
        ];

        for (const log of mockLogs) {
            reply.raw.write(`data: ${JSON.stringify({ log })}\n\n`);
            await new Promise(r => setTimeout(r, 500));
        }

        reply.raw.end();
    });

    // Get compile artifact (stub)
    app.get('/:id/compile/:jobId/artifact', {
        onRequest: [(app as any).authenticate],
        schema: {
            description: 'Download compile artifact',
            tags: ['Compile'],
            security: [{ cookieAuth: [] }],
        },
    }, async (request: FastifyRequest<{ Params: { id: string; jobId: string } }>, reply: FastifyReply) => {
        const user = (request as any).user;
        const { id, jobId } = request.params;

        const job = await prisma.compileJob.findFirst({
            where: { id: jobId },
            include: { session: true },
        });

        if (!job || job.session.ownerId !== user.id) {
            return reply.status(404).send({ error: 'Job not found' });
        }

        if (job.status !== 'SUCCESS' || !job.artifactPath) {
            return reply.status(400).send({
                error: 'Artifact not available',
                message: 'Compile worker not implemented. See COMPILE_WORKER.md',
            });
        }

        // In production, would stream the actual JAR file
        return reply.status(501).send({
            error: 'Not implemented',
            message: 'Compile worker required. See docs/COMPILE_WORKER.md',
        });
    });

    // List compile history
    app.get('/:id/compile', {
        onRequest: [(app as any).authenticate],
        schema: {
            description: 'List compile job history for session',
            tags: ['Compile'],
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

        const jobs = await prisma.compileJob.findMany({
            where: { sessionId: id },
            orderBy: { createdAt: 'desc' },
            take: 20,
        });

        return { jobs };
    });

    // Request compile fix (sends logs to AI)
    app.post('/:id/compile/:jobId/fix', {
        onRequest: [(app as any).authenticate],
        schema: {
            description: 'Request AI to fix compile errors',
            tags: ['Compile'],
            security: [{ cookieAuth: [] }],
        },
    }, async (request: FastifyRequest<{ Params: { id: string; jobId: string } }>, reply: FastifyReply) => {
        const user = (request as any).user;
        const { id, jobId } = request.params;

        const job = await prisma.compileJob.findFirst({
            where: { id: jobId },
            include: { session: true },
        });

        if (!job || job.session.ownerId !== user.id) {
            return reply.status(404).send({ error: 'Job not found' });
        }

        // Create a chat message with the error context
        const fixMessage = await prisma.chatMessage.create({
            data: {
                sessionId: id,
                userId: user.id,
                role: 'USER',
                content: `Please fix the compilation errors from job ${jobId}:\n\n${job.errorMessage || 'No error details available (compile worker not implemented)'}`,
                mode: 'AGENT',
            },
        });

        return {
            message: 'Fix request created',
            chatMessageId: fixMessage.id,
            note: 'Use the chat endpoint to continue the conversation',
        };
    });
}
