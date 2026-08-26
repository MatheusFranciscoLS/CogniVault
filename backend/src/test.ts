import { prisma } from './config/prisma';

async function runFullTest() {
    try {
        console.log('🏢 1. Criando empresa para o Teste Final...');
        const tenant = await prisma.tenant.create({
            data: { name: 'CogniVault Inc. - Master Test' }
        });

        console.log('\n🌐 2. Enviando PDF (Acompanhe o Terminal 1 para ver o Worker trabalhando)...');
        const pdfUrl = 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf';

        await fetch('http://127.0.0.1:3333/api/upload', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tenantId: tenant.id, filename: 'dummy.pdf', url: pdfUrl })
        });

        // Pausa de 5 segundos para a IA ler, quebrar e salvar o PDF no banco
        console.log('⏳ Aguardando 5 segundos para a IA do Google terminar de ler...');
        await new Promise(resolve => setTimeout(resolve, 5000));

        console.log('\n💬 3. Fazendo a pergunta ao CogniVault...');
        const question = 'O que está escrito neste PDF? Trata-se de um teste?';

        const chatResponse = await fetch('http://127.0.0.1:3333/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tenantId: tenant.id, question })
        });

        const chatData = await chatResponse.json();
        console.log('\n🤖 Resposta da IA:\n');
        console.log(chatData.answer || chatData);

    } catch (error) {
        console.error('❌ Erro no teste:', error);
    } finally {
        await prisma.$disconnect();
    }
}

runFullTest();