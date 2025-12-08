import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
    console.log('🌱 Seeding database...');

    // Create default admin user
    const adminPassword = await bcrypt.hash('Admin123!', 12);

    const admin = await prisma.user.upsert({
        where: { email: 'admin@auroracraft.local' },
        update: {},
        create: {
            username: 'admin',
            email: 'admin@auroracraft.local',
            passwordHash: adminPassword,
            role: 'ADMIN',
            tokenBalance: 1000000, // 1M tokens for admin
        },
    });

    console.log('✅ Created admin user:', admin.email);

    // Create example providers (with placeholder credentials)
    const openRouterProvider = await prisma.provider.upsert({
        where: { name: 'openrouter' },
        update: {},
        create: {
            name: 'openrouter',
            displayName: 'OpenRouter',
            baseUrl: 'https://openrouter.ai/api/v1',
            authType: 'BEARER',
            credentialsEncrypted: 'PLACEHOLDER_ENCRYPT_YOUR_KEY',
            healthCheckEndpoint: '/models',
            defaultPayload: {
                temperature: 0.7,
                max_tokens: 4096,
            },
            rateLimitRpm: 60,
        },
    });

    console.log('✅ Created provider:', openRouterProvider.displayName);

    // Create example models for OpenRouter
    const models = [
        {
            modelId: 'anthropic/claude-3.5-sonnet',
            displayName: 'Claude 3.5 Sonnet',
            perCharCost: 0.000003,
            maxTokens: 8192,
            tags: ['chat', 'code', 'reasoning'],
        },
        {
            modelId: 'openai/gpt-4-turbo',
            displayName: 'GPT-4 Turbo',
            perCharCost: 0.00001,
            maxTokens: 4096,
            tags: ['chat', 'code'],
        },
        {
            modelId: 'google/gemini-pro-1.5',
            displayName: 'Gemini Pro 1.5',
            perCharCost: 0.000002,
            maxTokens: 8192,
            tags: ['chat', 'code', 'vision'],
        },
        {
            modelId: 'deepseek/deepseek-coder',
            displayName: 'DeepSeek Coder',
            perCharCost: 0.0000005,
            maxTokens: 4096,
            tags: ['code'],
        },
    ];

    for (const model of models) {
        await prisma.model.upsert({
            where: {
                providerId_modelId: {
                    providerId: openRouterProvider.id,
                    modelId: model.modelId,
                },
            },
            update: {},
            create: {
                providerId: openRouterProvider.id,
                modelId: model.modelId,
                displayName: model.displayName,
                perCharCost: model.perCharCost,
                maxTokens: model.maxTokens,
                tags: model.tags,
                isEnabled: true,
            },
        });
        console.log('✅ Created model:', model.displayName);
    }

    // Create a sample session for demo
    const demoSession = await prisma.session.upsert({
        where: { id: 'demo-session' },
        update: {},
        create: {
            id: 'demo-session',
            title: 'Demo Plugin Project',
            targetSoftware: 'paper',
            targetVersion: '1.20.4',
            workspacePath: './data/workspaces/demo-session',
            ownerId: admin.id,
        },
    });

    console.log('✅ Created demo session:', demoSession.title);

    console.log('\n🎉 Seed completed successfully!');
}

main()
    .catch((e) => {
        console.error('❌ Seed failed:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
