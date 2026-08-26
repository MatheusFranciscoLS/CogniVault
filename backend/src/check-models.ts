import 'dotenv/config';

async function checkModels() {
    try {
        console.log('🔍 Consultando os servidores do Google...');
        const key = process.env.GEMINI_API_KEY;

        if (!key) {
            throw new Error('Chave GEMINI_API_KEY não encontrada no .env');
        }

        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`);
        const data = await response.json();

        if (data.error) {
            console.error('❌ Erro retornado pelo Google:', data.error.message);
            return;
        }

        // Filtra apenas os modelos que servem para Chat (generateContent)
        const chatModels = data.models
            .filter((m: any) => m.supportedGenerationMethods?.includes('generateContent'))
            .map((m: any) => m.name.replace('models/', ''));

        console.log('\n✅ Nomes exatos de modelos de Chat permitidos para a sua chave:');
        console.log(chatModels);

    } catch (error) {
        console.error('❌ Falha na consulta:', error);
    }
}

checkModels();