
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function testCascadeDeletion() {
    try {
        console.log('Connecting to DB...');

        // 1. Get Provider
        const provider = await prisma.provider.findFirst({ where: { name: 'OpenRouter' } });
        if (!provider) throw new Error('Provider not found');

        // 2. Cleanup old test data
        console.log('Cleaning up old test data...');
        const oldModel = await prisma.model.findFirst({
            where: { modelId: 'test/prisma-delete', providerId: provider.id }
        });
        if (oldModel) {
            await prisma.model.delete({ where: { id: oldModel.id } });
            console.log('Old test model deleted');
        }

        // 3. Create Model
        const model = await prisma.model.create({
            data: {
                name: 'Prisma Test Model',
                modelId: 'test/prisma-delete',
                providerId: provider.id,
                inputTokenCost: 0,
                outputTokenCost: 0
            }
        });
        console.log('Model created:', model.id);

        // 4. Create User & Session & Message
        const user = await prisma.user.findFirst();
        if (!user) throw new Error('No user found');

        const session = await prisma.session.create({
            data: {
                userId: user.id,
                name: 'Test Session',
                projectType: 'MINECRAFT_PLUGIN'
            }
        });

        // 5. Create Message linked to Model (Crucial Step)
        await prisma.chatMessage.create({
            data: {
                sessionId: session.id,
                role: 'USER',
                content: 'Test message linked to model',
                modelId: model.id // LINKING TO MODEL
            }
        });
        console.log('Chat message created with model link');

        // 6. Attempt Deletion
        console.log('Attempting to delete model...');
        await prisma.model.delete({
            where: { id: model.id }
        });
        console.log('✅ Model deleted successfully! Constraint is invalid (FIX WORKED)');

        // Cleanup session
        await prisma.session.delete({ where: { id: session.id } });

    } catch (error) {
        console.error('❌ Test failed:', error.message || error);
        if (error.code === 'P2003') {
            console.error('Foreign Key Constraint failed - FIX DID NOT WORK');
        }
        process.exit(1);
    } finally {
        await prisma.$disconnect();
    }
}

testCascadeDeletion();
