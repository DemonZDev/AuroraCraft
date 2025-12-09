import prisma from '../config/database.js';
import { hashPassword, comparePassword, validatePasswordStrength } from '../utils/password.js';
import { signToken, JwtPayload } from '../utils/jwt.js';
import { createError } from '../middleware/errorHandler.js';
import { Role } from '@prisma/client';

export interface RegisterInput {
    username: string;
    email: string;
    password: string;
    confirmPassword: string;
}

export interface LoginInput {
    email: string;
    password: string;
}

export interface AuthResult {
    user: {
        id: string;
        username: string;
        email: string;
        role: string;
        tokenBalance: number;
    };
    token: string;
}

export async function register(input: RegisterInput): Promise<AuthResult> {
    const { username, email, password, confirmPassword } = input;

    // Validate passwords match
    if (password !== confirmPassword) {
        throw createError('Passwords do not match', 400);
    }

    // Validate password strength
    const strength = validatePasswordStrength(password);
    if (!strength.valid) {
        throw createError(strength.message!, 400);
    }

    // Check if user exists
    const existingUser = await prisma.user.findFirst({
        where: {
            OR: [{ email }, { username }],
        },
    });

    if (existingUser) {
        if (existingUser.email === email) {
            throw createError('Email already registered', 400);
        }
        throw createError('Username already taken', 400);
    }

    // Get signup bonus from settings
    const signupBonusSetting = await prisma.systemSetting.findUnique({
        where: { key: 'signup_bonus' },
    });
    const signupBonus = parseInt(signupBonusSetting?.value || '100000', 10);

    // Create user
    const passwordHash = await hashPassword(password);
    const user = await prisma.user.create({
        data: {
            username,
            email,
            passwordHash,
            tokenBalance: signupBonus,
        },
        select: {
            id: true,
            username: true,
            email: true,
            role: true,
            tokenBalance: true,
        },
    });

    // Record signup bonus transaction
    await prisma.tokenTransaction.create({
        data: {
            userId: user.id,
            amount: signupBonus,
            type: 'SIGNUP_BONUS',
            description: 'Welcome bonus tokens',
        },
    });

    // Generate token
    const token = signToken({
        userId: user.id,
        email: user.email,
        role: user.role,
    });

    return { user, token };
}

export async function login(input: LoginInput): Promise<AuthResult> {
    const { email, password } = input;

    const user = await prisma.user.findUnique({
        where: { email },
        select: {
            id: true,
            username: true,
            email: true,
            role: true,
            tokenBalance: true,
            passwordHash: true,
        },
    });

    if (!user) {
        throw createError('Invalid email or password', 401);
    }

    const validPassword = await comparePassword(password, user.passwordHash);
    if (!validPassword) {
        throw createError('Invalid email or password', 401);
    }

    const token = signToken({
        userId: user.id,
        email: user.email,
        role: user.role,
    });

    // Remove passwordHash from response
    const { passwordHash, ...userWithoutPassword } = user;

    return { user: userWithoutPassword, token };
}

export async function getCurrentUser(userId: string) {
    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
            id: true,
            username: true,
            email: true,
            role: true,
            tokenBalance: true,
            createdAt: true,
        },
    });

    if (!user) {
        throw createError('User not found', 404);
    }

    return user;
}
