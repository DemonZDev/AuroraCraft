import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { config } from '../config.js';
import path from 'path';
import fs from 'fs/promises';

const createSessionSchema = z.object({
    title: z.string().min(1).max(100),
    targetSoftware: z.string().optional().default('paper'),
    targetVersion: z.string().optional().default('1.20.4'),
});

const updateSessionSchema = z.object({
    title: z.string().min(1).max(100).optional(),
    targetSoftware: z.string().optional(),
    targetVersion: z.string().optional(),
});

export async function sessionRoutes(app: FastifyInstance) {

    // Create session
    app.post('/', {
        onRequest: [(app as any).authenticate],
        schema: {
            description: 'Create a new project session',
            tags: ['Sessions'],
            security: [{ cookieAuth: [] }],
        },
    }, async (request: FastifyRequest, reply: FastifyReply) => {
        const user = (request as any).user;
        const body = createSessionSchema.parse(request.body || {});

        const session = await prisma.session.create({
            data: {
                title: body.title || 'Untitled Project',
                targetSoftware: body.targetSoftware,
                targetVersion: body.targetVersion,
                workspacePath: '', // Will be set below
                ownerId: user.id,
            },
        });

        // Create workspace directory
        const workspacePath = path.join(config.workspacePath, session.id);
        await fs.mkdir(workspacePath, { recursive: true });

        // Update session with workspace path
        const updated = await prisma.session.update({
            where: { id: session.id },
            data: { workspacePath },
            include: {
                _count: {
                    select: { chatMessages: true, files: true },
                },
            },
        });

        // Create initial plugin scaffold
        const scaffoldPath = path.join(workspacePath, 'src', 'main', 'java', 'com', 'example', 'plugin');
        await fs.mkdir(scaffoldPath, { recursive: true });

        const mainClass = `package com.example.plugin;

import org.bukkit.plugin.java.JavaPlugin;

public class Main extends JavaPlugin {
    @Override
    public void onEnable() {
        getLogger().info("Plugin enabled!");
    }

    @Override
    public void onDisable() {
        getLogger().info("Plugin disabled!");
    }
}`;

        await fs.writeFile(path.join(scaffoldPath, 'Main.java'), mainClass);

        // Create plugin.yml
        const resourcesPath = path.join(workspacePath, 'src', 'main', 'resources');
        await fs.mkdir(resourcesPath, { recursive: true });

        const pluginYml = `name: ${body.title.replace(/[^a-zA-Z0-9]/g, '')}
version: 1.0.0
main: com.example.plugin.Main
api-version: ${body.targetVersion}
description: A custom Minecraft plugin built with AuroraCraft`;

        await fs.writeFile(path.join(resourcesPath, 'plugin.yml'), pluginYml);

        // Create pom.xml
        const pomXml = `<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 http://maven.apache.org/xsd/maven-4.0.0.xsd">
    <modelVersion>4.0.0</modelVersion>

    <groupId>com.example</groupId>
    <artifactId>${body.title.toLowerCase().replace(/[^a-z0-9]/g, '-')}</artifactId>
    <version>1.0.0</version>
    <packaging>jar</packaging>

    <properties>
        <java.version>21</java.version>
        <project.build.sourceEncoding>UTF-8</project.build.sourceEncoding>
    </properties>

    <repositories>
        <repository>
            <id>papermc</id>
            <url>https://repo.papermc.io/repository/maven-public/</url>
        </repository>
    </repositories>

    <dependencies>
        <dependency>
            <groupId>io.papermc.paper</groupId>
            <artifactId>paper-api</artifactId>
            <version>${body.targetVersion}-R0.1-SNAPSHOT</version>
            <scope>provided</scope>
        </dependency>
    </dependencies>

    <build>
        <plugins>
            <plugin>
                <groupId>org.apache.maven.plugins</groupId>
                <artifactId>maven-compiler-plugin</artifactId>
                <version>3.11.0</version>
                <configuration>
                    <source>\${java.version}</source>
                    <target>\${java.version}</target>
                </configuration>
            </plugin>
        </plugins>
    </build>
</project>`;

        await fs.writeFile(path.join(workspacePath, 'pom.xml'), pomXml);

        // Log creation
        await prisma.log.create({
            data: {
                type: 'SESSION',
                action: 'create',
                userId: user.id,
                sessionId: session.id,
                payload: { title: body.title },
            },
        });

        return reply.status(201).send({ session: updated });
    });

    // List sessions
    app.get('/', {
        onRequest: [(app as any).authenticate],
        schema: {
            description: 'List all sessions for current user',
            tags: ['Sessions'],
            security: [{ cookieAuth: [] }],
        },
    }, async (request: FastifyRequest, reply: FastifyReply) => {
        const user = (request as any).user;

        const sessions = await prisma.session.findMany({
            where: { ownerId: user.id },
            orderBy: { updatedAt: 'desc' },
            include: {
                _count: {
                    select: { chatMessages: true, files: true, compileJobs: true },
                },
            },
        });

        return { sessions };
    });

    // Get session by ID
    app.get('/:id', {
        onRequest: [(app as any).authenticate],
        schema: {
            description: 'Get session details by ID',
            tags: ['Sessions'],
            security: [{ cookieAuth: [] }],
        },
    }, async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
        const user = (request as any).user;
        const { id } = request.params;

        const session = await prisma.session.findFirst({
            where: { id, ownerId: user.id },
            include: {
                _count: {
                    select: { chatMessages: true, files: true, checkpoints: true, compileJobs: true },
                },
            },
        });

        if (!session) {
            return reply.status(404).send({ error: 'Session not found' });
        }

        return { session };
    });

    // Update session
    app.patch('/:id', {
        onRequest: [(app as any).authenticate],
        schema: {
            description: 'Update session (rename, change target)',
            tags: ['Sessions'],
            security: [{ cookieAuth: [] }],
        },
    }, async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
        const user = (request as any).user;
        const { id } = request.params;
        const body = updateSessionSchema.parse(request.body);

        const session = await prisma.session.findFirst({
            where: { id, ownerId: user.id },
        });

        if (!session) {
            return reply.status(404).send({ error: 'Session not found' });
        }

        const updated = await prisma.session.update({
            where: { id },
            data: body,
        });

        return { session: updated };
    });

    // Delete session
    app.delete('/:id', {
        onRequest: [(app as any).authenticate],
        schema: {
            description: 'Delete session and all associated data',
            tags: ['Sessions'],
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

        // Delete workspace directory
        try {
            await fs.rm(session.workspacePath, { recursive: true, force: true });
        } catch (e) {
            // Ignore if already deleted
        }

        // Delete session (cascades to related records)
        await prisma.session.delete({ where: { id } });

        // Log deletion
        await prisma.log.create({
            data: {
                type: 'SESSION',
                action: 'delete',
                userId: user.id,
                payload: { sessionId: id, title: session.title },
            },
        });

        return { success: true };
    });
}
