
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const provider = await prisma.provider.findFirst({
        where: { name: 'OpenRouter' }
    });
    if (provider && provider.apiKey) {
        console.log('OPENROUTER_KEY=' + provider.apiKey);
    } else {
        console.log('No OpenRouter key found');
    }
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
