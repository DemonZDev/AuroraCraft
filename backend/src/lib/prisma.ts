import { PrismaClient } from '@prisma/client';
import { config } from '../config.js';

declare global {
    var prisma: PrismaClient | undefined;
}

export const prisma = globalThis.prisma || new PrismaClient({
    log: config.isDev ? ['query', 'info', 'warn', 'error'] : ['error'],
});

if (config.isDev) {
    globalThis.prisma = prisma;
}
