
import { PrismaClient, AuthType } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('🔌 Adding DeepSeek Provider...');

    const deepseek = await prisma.provider.upsert({
        where: { name: 'DeepSeek' },
        update: {
            baseUrl: 'https://api.deepseek.com',
            authType: 'BEARER',
            apiKey: 'sk-401fbd42cf00493b8c28db07f3027460',
            isEnabled: true
        },
        create: {
            name: 'DeepSeek',
            baseUrl: 'https://api.deepseek.com',
            authType: 'BEARER',
            apiKey: 'sk-401fbd42cf00493b8c28db07f3027460',
            isEnabled: true,
            defaultPayload: {
                temperature: 0.7,
                max_tokens: 4000
            }
        },
    });

    console.log(`✅ Provider ID: ${deepseek.id}`);

    const models = [
        {
            name: 'DeepSeek V3 (Chat)',
            modelId: 'deepseek-chat',
            inputCost: 0.0001,
            outputCost: 0.0002,
            context: 64000
        },
        {
            name: 'DeepSeek R1 (Reasoner)',
            modelId: 'deepseek-reasoner',
            inputCost: 0.0005,
            outputCost: 0.002,
            context: 64000
        }
    ];

    for (const m of models) {
        await prisma.model.upsert({
            where: {
                providerId_modelId: {
                    providerId: deepseek.id,
                    modelId: m.modelId
                }
            },
            update: {
                name: m.name,
                inputTokenCost: m.inputCost,
                outputTokenCost: m.outputCost,
                isEnabled: true,
                isVisible: true
            },
            create: {
                providerId: deepseek.id,
                name: m.name,
                modelId: m.modelId,
                inputTokenCost: m.inputCost,
                outputTokenCost: m.outputCost,
                maxContextLength: m.context,
                isEnabled: true,
                isVisible: true
            }
        });
        console.log(`   - Added Model: ${m.name}`);
    }

    console.log('🚀 DeepSeek Setup Complete!');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
