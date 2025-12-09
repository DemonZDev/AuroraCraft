import prisma from '../config/database.js';
import { createError } from '../middleware/errorHandler.js';
import { TransactionType } from '@prisma/client';

export async function getBalance(userId: string): Promise<number> {
    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { tokenBalance: true },
    });

    if (!user) {
        throw createError('User not found', 404);
    }

    return user.tokenBalance;
}

export async function deductTokens(
    userId: string,
    amount: number,
    type: TransactionType,
    description?: string,
    metadata?: Record<string, any>
): Promise<number> {
    // Ensure amount is positive
    const deduction = Math.abs(amount);

    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { tokenBalance: true },
    });

    if (!user) {
        throw createError('User not found', 404);
    }

    if (user.tokenBalance < deduction) {
        throw createError('Insufficient tokens', 402, 'INSUFFICIENT_TOKENS');
    }

    // Update balance and create transaction in a transaction
    const [updatedUser] = await prisma.$transaction([
        prisma.user.update({
            where: { id: userId },
            data: { tokenBalance: { decrement: deduction } },
            select: { tokenBalance: true },
        }),
        prisma.tokenTransaction.create({
            data: {
                userId,
                amount: -deduction,
                type,
                description,
                metadata: metadata || undefined,
            },
        }),
    ]);

    return updatedUser.tokenBalance;
}

export async function addTokens(
    userId: string,
    amount: number,
    type: TransactionType,
    description?: string,
    metadata?: Record<string, any>
): Promise<number> {
    const addition = Math.abs(amount);

    const [updatedUser] = await prisma.$transaction([
        prisma.user.update({
            where: { id: userId },
            data: { tokenBalance: { increment: addition } },
            select: { tokenBalance: true },
        }),
        prisma.tokenTransaction.create({
            data: {
                userId,
                amount: addition,
                type,
                description,
                metadata: metadata || undefined,
            },
        }),
    ]);

    return updatedUser.tokenBalance;
}

export async function getTransactionHistory(
    userId: string,
    limit: number = 50,
    offset: number = 0
) {
    const [transactions, total] = await Promise.all([
        prisma.tokenTransaction.findMany({
            where: { userId },
            orderBy: { createdAt: 'desc' },
            take: limit,
            skip: offset,
        }),
        prisma.tokenTransaction.count({ where: { userId } }),
    ]);

    return { transactions, total };
}

export async function calculateTokenCost(
    modelId: string,
    inputChars: number,
    outputChars: number
): Promise<{ inputCost: number; outputCost: number; totalCost: number }> {
    const model = await prisma.model.findUnique({
        where: { id: modelId },
        select: { inputTokenCost: true, outputTokenCost: true },
    });

    if (!model) {
        throw createError('Model not found', 404);
    }

    const inputCost = Math.ceil((inputChars / 1000) * model.inputTokenCost * 1000);
    const outputCost = Math.ceil((outputChars / 1000) * model.outputTokenCost * 1000);

    return {
        inputCost,
        outputCost,
        totalCost: inputCost + outputCost,
    };
}
