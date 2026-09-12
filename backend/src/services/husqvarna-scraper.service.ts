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
    replacedBy?: string;
    fitsTo?: string[];
}

export class HusqvarnaScraperService {
    private static positiveCache = new LRUCache<string, HusqvarnaLivePart>({
        max: 5000,
        ttl: 1000 * 60 * 60 * 24 * 7,
    });
    private static negativeCache = new LRUCache<string, true>({
        max: 5000,
        ttl: 10 * 60 * 1000,
    });
    private static readonly FETCH_TIMEOUT_MS = 5000;

    /**
     * Busca os dados reais de uma peça diretamente no Portal B2B da Husqvarna.
     * Sucessos podem ficar em cache por sete dias. Apenas um 404 explícito recebe
     * cache negativo curto; falhas de rede, timeout ou parsing nunca significam
     * que a peça não existe.
     */
    static async fetchLiveData(partCode: string, retries = 1): Promise<HusqvarnaLivePart | null> {
        const cleanCode = partCode.replace(/[\s-]/g, '');
        const cached = this.positiveCache.get(cleanCode);
        if (cached) return cached;
        if (this.negativeCache.has(cleanCode)) return null;

        const url = `https://portal.husqvarnagroup.com/br/spare-parts/?part=${cleanCode}`;
        let response: Response | null = null;
        let html: string | null = null;

        for (let attempt = 0; attempt <= retries; attempt++) {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), this.FETCH_TIMEOUT_MS);

            try {
                response = await fetch(url, {
                    signal: controller.signal,
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                        'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
                    },
                });

                if (response.ok) {
                    // O mesmo AbortController cobre também o download do corpo.
                    // Sem isso, um servidor que envia apenas os headers poderia
                    // manter response.text() pendurado indefinidamente.
                    html = await response.text();
                    break;
                }

                if (response.status === 404) {
                    console.warn(`[Husqvarna Scraper] Portal returned ${response.status} for part ${cleanCode}`);
                    this.negativeCache.set(cleanCode, true);
                    return null;
                }

                console.warn(`[Husqvarna Scraper] Portal returned ${response.status} for part ${cleanCode}, attempt ${attempt}`);
            } catch (error: any) {
                console.warn(`[Husqvarna Scraper] Error fetching part ${cleanCode} on attempt ${attempt}:`, error.message || error);
            } finally {
                clearTimeout(timeoutId);
            }
        }

        if (!response?.ok || html === null) {
            console.warn(`[Husqvarna Scraper] Max retries reached for part ${cleanCode} or failed.`);
            return null;
        }

        try {
            const regex = /React\.createElement\(SparePartDetails,\s*(\{.*?\})\)\)\}\}\);/s;
            const match = html.match(regex);

            if (!match || !match[1]) {
                console.warn(`[Husqvarna Scraper] JSON Payload not found in HTML for part ${cleanCode}`);
                return null;
            }

            let payload: any;
            try {
                payload = JSON.parse(match[1]);
            } catch (error) {
                console.error(`[Husqvarna Scraper] Failed to parse JSON for part ${cleanCode}`, error);
                return null;
            }

            const sparePartsDict = payload?.query?.site?.spareParts?.byId;
            if (!sparePartsDict) {
                console.warn(`[Husqvarna Scraper] spareParts.byId not found in payload for part ${cleanCode}`);
                return null;
            }

            let replacedBy: string | undefined;
            if (sparePartsDict.replacedBy?.articleNumberFormatted) {
                replacedBy = sparePartsDict.replacedBy.articleNumberFormatted;
            }

            let fitsTo: string[] = [];
            if (sparePartsDict.fitsTo && Array.isArray(sparePartsDict.fitsTo)) {
                fitsTo = sparePartsDict.fitsTo.map((f: any) => f.name || f.articleNumberFormatted).filter(Boolean);
            }

            const livePart: HusqvarnaLivePart = {
                name: sparePartsDict.name || 'Desconhecido',
                shortName: sparePartsDict.shortName,
                articleNumberFormatted: sparePartsDict.articleNumberFormatted,
                imageUrl: sparePartsDict.mainImage?.url,
                specifications: sparePartsDict.specifications,
                originalPartUrl: sparePartsDict.url || url,
                replacedBy,
                fitsTo,
            };

            this.positiveCache.set(cleanCode, livePart);
            this.negativeCache.delete(cleanCode);
            console.log(`[Husqvarna Scraper] Live data fetched successfully for ${cleanCode}`);
            return livePart;
        } catch (error: any) {
            console.error(`[Husqvarna Scraper] Error parsing part ${partCode}:`, error.message || error);
            return null;
        }
    }
}
