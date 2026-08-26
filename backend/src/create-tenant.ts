import { prisma } from './config/prisma';

async function run() {
    try {
        const tenant = await prisma.tenant.create({
            data: { name: 'Cliente do Frontend' }
        });

        console.log('\n✅ Empresa criada com sucesso no banco de dados!');
        console.log('👉 VÁ NO SEU ARQUIVO DO FRONTEND (App.tsx) E TROQUE A LINHA DO TENANT POR ESTA:');
        console.log(`const tenantId = '${tenant.id}';\n`);

    } catch (error) {
        console.error(error);
    } finally {
        await prisma.$disconnect();
    }
}

run();