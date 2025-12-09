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

    // Create sample AI providers
    const openRouterProvider = await prisma.provider.upsert({
        where: { name: 'OpenRouter' },
        update: {},
        create: {
            name: 'OpenRouter',
            baseUrl: 'https://openrouter.ai/api/v1',
            authType: AuthType.BEARER,
            apiKey: '', // Admin needs to configure
            isEnabled: false,
        },
    });

    await prisma.model.upsert({
        where: {
            providerId_modelId: {
                providerId: openRouterProvider.id,
                modelId: 'anthropic/claude-3.5-sonnet',
            },
        },
        update: {},
        create: {
            name: 'Claude 3.5 Sonnet',
            modelId: 'anthropic/claude-3.5-sonnet',
            inputTokenCost: 0.003,
            outputTokenCost: 0.015,
            maxContextLength: 200000,
            providerId: openRouterProvider.id,
            isEnabled: true,
            isVisible: true,
        },
    });

    await prisma.model.upsert({
        where: {
            providerId_modelId: {
                providerId: openRouterProvider.id,
                modelId: 'google/gemini-2.0-flash-exp:free',
            },
        },
        update: {},
        create: {
            name: 'Gemini 2.0 Flash (Free)',
            modelId: 'google/gemini-2.0-flash-exp:free',
            inputTokenCost: 0,
            outputTokenCost: 0,
            maxContextLength: 1000000,
            providerId: openRouterProvider.id,
            isEnabled: true,
            isVisible: true,
        },
    });

    console.log('✅ Sample providers and models created');

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
