import { LRUCache } from 'lru-cache';

export interface HusqvarnaLiveSpecifications {
    grossWeight?: string;
    packagingHeight?: string;
    packagingLength?: string;
    packagingWidth?: string;
    ean?: string;
    netWeight?: string;
    articleDescription?: string;
    [key: string]: string | undefined | null;
}

export interface HusqvarnaLivePart {
    name: string;
    shortName?: string;
    articleNumberFormatted?: string;
    imageUrl?: string;
    specifications?: HusqvarnaLiveSpecifications;
    originalPartUrl: string;
}

export class HusqvarnaScraperService {
    // Cache de peças para não sobrecarregar o portal Husqvarna
    // TTL de 7 dias = 1000 * 60 * 60 * 24 * 7 = 604,800,000 ms
    private static cache = new LRUCache<string, HusqvarnaLivePart | null>({
        max: 5000, // Armazena até 5000 peças diferentes na RAM
        ttl: 1000 * 60 * 60 * 24 * 7,
    });

    /**
     * Busca os dados reais de uma peça diretamente no Portal B2B da Husqvarna
     * @param partCode Código da peça (ex: 532431650)
     */
    static async fetchLiveData(partCode: string): Promise<HusqvarnaLivePart | null> {
        // Limpar espaços ou traços do código para a URL
        const cleanCode = partCode.replace(/[\s-]/g, '');

        if (this.cache.has(cleanCode)) {
            return this.cache.get(cleanCode) || null;
        }

        try {
            const url = `https://portal.husqvarnagroup.com/br/spare-parts/?part=${cleanCode}`;
            
            // Buscar o HTML
            const response = await fetch(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                    'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
                }
            });

            if (!response.ok) {
                console.warn(`[Husqvarna Scraper] Portal returned ${response.status} for part ${cleanCode}`);
                this.cache.set(cleanCode, null);
                return null;
            }

            const html = await response.text();

            // A Husqvarna hidrata o estado do React dentro do HTML usando ReactDOMClient.createRoot(...).render(React.createElement(SparePartDetails, { ... JSON ...}))
            // Vamos tentar extrair esse JSON.
            const regex = /React\.createElement\(SparePartDetails,\s*(\{.*?\})\)\)\}\}\);/s;
            const match = html.match(regex);

            if (!match || !match[1]) {
                 console.warn(`[Husqvarna Scraper] JSON Payload not found in HTML for part ${cleanCode}`);
                 this.cache.set(cleanCode, null);
                 return null;
            }

            let payload: any;
            try {
                payload = JSON.parse(match[1]);
            } catch (e) {
                console.error(`[Husqvarna Scraper] Failed to parse JSON for part ${cleanCode}`, e);
                this.cache.set(cleanCode, null);
                return null;
            }

            // Navegando no payload para achar a peça
            const sparePartsDict = payload?.query?.site?.spareParts?.byId;
            
            if (!sparePartsDict) {
                console.warn(`[Husqvarna Scraper] spareParts.byId not found in payload for part ${cleanCode}`);
                this.cache.set(cleanCode, null);
                return null;
            }

            const livePart: HusqvarnaLivePart = {
                name: sparePartsDict.name || 'Desconhecido',
                shortName: sparePartsDict.shortName,
                articleNumberFormatted: sparePartsDict.articleNumberFormatted,
                imageUrl: sparePartsDict.mainImage?.url, // Aqui está o segredo!
                specifications: sparePartsDict.specifications,
                originalPartUrl: sparePartsDict.url || url
            };

            // Salva no cache
            this.cache.set(cleanCode, livePart);
            console.log(`[Husqvarna Scraper] Live data fetched successfully for ${cleanCode}`);
            return livePart;

        } catch (error) {
            console.error(`[Husqvarna Scraper] Error fetching part ${partCode}:`, error);
            // Em caso de erro de rede, não faremos cache nulo com TTL longo, só throw/return null.
            return null;
        }
    }
}
