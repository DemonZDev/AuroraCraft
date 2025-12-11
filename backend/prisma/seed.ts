import { PrismaClient, Role, AuthType } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
    console.log('🌱 Seeding database...');

    // Create default admin user
    const adminPassword = process.env.DEFAULT_ADMIN_PASSWORD || 'Admin123!';
    const hashedPassword = await bcrypt.hash(adminPassword, 12);

    const admin = await prisma.user.upsert({
        where: { email: 'admin@auroracraft.local' },
        update: {},
        create: {
            username: process.env.DEFAULT_ADMIN_USERNAME || 'admin',
            email: process.env.DEFAULT_ADMIN_EMAIL || 'admin@auroracraft.local',
            passwordHash: hashedPassword,
            role: Role.ADMIN,
            tokenBalance: 1000000, // 1M tokens for admin
        },
    });

    console.log(`✅ Admin user created: ${admin.username}`);

    // Create default system settings
    const settings = [
        { key: 'site_name', value: 'AuroraCraft' },
        { key: 'site_description', value: 'AI-Powered Minecraft Plugin Builder' },
        { key: 'enhance_cost', value: '500' }, // Token cost for enhance
        { key: 'signup_bonus', value: '100000' }, // Tokens on signup
    ];

    for (const setting of settings) {
        await prisma.systemSetting.upsert({
            where: { key: setting.key },
            update: { value: setting.value },
            create: setting,
        });
    }

    console.log('✅ System settings created');

    // ============================================
    // AI PROVIDERS CONFIGURATION
    // API keys are loaded from environment variables
    // Set these in your .env file:
    //   OPENROUTER_API_KEY=your_key_here
    //   PERPLEXITY_API_KEY=your_key_here
    //   GOOGLE_API_KEY=your_key_here
    // ============================================

    // Get API keys from environment
    const openRouterApiKey = process.env.OPENROUTER_API_KEY || '';
    const perplexityApiKey = process.env.PERPLEXITY_API_KEY || '';
    const googleApiKey = process.env.GOOGLE_API_KEY || '';

    // 1. OpenRouter Provider (Free models)
    if (openRouterApiKey) {
        const openRouterProvider = await prisma.provider.upsert({
            where: { name: 'OpenRouter' },
            update: {
                apiKey: openRouterApiKey,
                isEnabled: true,
            },
            create: {
                name: 'OpenRouter',
                baseUrl: 'https://openrouter.ai/api/v1',
                authType: AuthType.BEARER,
                apiKey: openRouterApiKey,
                isEnabled: true,
            },
        });

        // Delete old OpenRouter models and add correct ones
        await prisma.model.deleteMany({
            where: { providerId: openRouterProvider.id }
        });

        // OpenRouter Free Models (verified working)
        const openRouterModels = [
            {
                name: 'Kimi K2 (Free)',
                modelId: 'moonshotai/kimi-k2:free',
                inputTokenCost: 0,
                outputTokenCost: 0,
                maxContextLength: 128000,
            },
            {
                name: 'Qwen3 Coder (Free)',
                modelId: 'qwen/qwen3-coder:free',
                inputTokenCost: 0,
                outputTokenCost: 0,
                maxContextLength: 128000,
            },
            {
                name: 'Gemini 2.0 Flash (Free)',
                modelId: 'google/gemini-2.0-flash-exp:free',
                inputTokenCost: 0,
                outputTokenCost: 0,
                maxContextLength: 1000000,
            },
            {
                name: 'Llama 3.3 70B (Free)',
                modelId: 'meta-llama/llama-3.3-70b-instruct:free',
                inputTokenCost: 0,
                outputTokenCost: 0,
                maxContextLength: 128000,
            },
            {
                name: 'Qwen3 235B (Free)',
                modelId: 'qwen/qwen3-235b-a22b:free',
                inputTokenCost: 0,
                outputTokenCost: 0,
                maxContextLength: 128000,
            },
        ];

        for (const model of openRouterModels) {
            await prisma.model.create({
                data: {
                    ...model,
                    providerId: openRouterProvider.id,
                    isEnabled: true,
                    isVisible: true,
                },
            });
        }

        console.log('✅ OpenRouter provider and free models configured');
    } else {
        console.log('⚠️ OpenRouter skipped (OPENROUTER_API_KEY not set)');
    }

    // 2. Perplexity Provider (Paid)
    if (perplexityApiKey) {
        const perplexityProvider = await prisma.provider.upsert({
            where: { name: 'Perplexity' },
            update: {
                apiKey: perplexityApiKey,
                isEnabled: true,
            },
            create: {
                name: 'Perplexity',
                baseUrl: 'https://api.perplexity.ai',
                authType: AuthType.BEARER,
                apiKey: perplexityApiKey,
                isEnabled: true,
            },
        });

        // Delete old Perplexity models and add correct ones
        await prisma.model.deleteMany({
            where: { providerId: perplexityProvider.id }
        });

        // Perplexity Models (verified working)
        const perplexityModels = [
            {
                name: 'Sonar Reasoning Pro',
                modelId: 'sonar-reasoning-pro',
                inputTokenCost: 0.002,
                outputTokenCost: 0.008,
                maxContextLength: 128000,
            },
            {
                name: 'Sonar Deep Research',
                modelId: 'sonar-deep-research',
                inputTokenCost: 0.002,
                outputTokenCost: 0.008,
                maxContextLength: 128000,
            },
        ];

        for (const model of perplexityModels) {
            await prisma.model.create({
                data: {
                    ...model,
                    providerId: perplexityProvider.id,
                    isEnabled: true,
                    isVisible: true,
                },
            });
        }

        console.log('✅ Perplexity provider and models configured');
    } else {
        console.log('⚠️ Perplexity skipped (PERPLEXITY_API_KEY not set)');
    }

    // 3. Google Provider (Free tier)
    if (googleApiKey) {
        const googleProvider = await prisma.provider.upsert({
            where: { name: 'Google' },
            update: {
                apiKey: googleApiKey,
                isEnabled: true,
            },
            create: {
                name: 'Google',
                baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
                authType: AuthType.BEARER,
                apiKey: googleApiKey,
                isEnabled: true,
            },
        });

        // Delete old Google models and add correct ones
        await prisma.model.deleteMany({
            where: { providerId: googleProvider.id }
        });

        // Google Models (verified working)
        const googleModels = [
            {
                name: 'Gemini 2.5 Flash',
                modelId: 'gemini-2.5-flash',
                inputTokenCost: 0,
                outputTokenCost: 0,
                maxContextLength: 1000000,
            },
        ];

        for (const model of googleModels) {
            await prisma.model.create({
                data: {
                    ...model,
                    providerId: googleProvider.id,
                    isEnabled: true,
                    isVisible: true,
                },
            });
        }

        console.log('✅ Google provider and Gemini 2.5 Flash configured');
    } else {
        console.log('⚠️ Google skipped (GOOGLE_API_KEY not set)');
    }

    console.log('🎉 Database seeding completed!');
}

main()
    .catch((e) => {
        console.error('❌ Seeding failed:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
