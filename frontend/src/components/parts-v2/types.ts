import type { SearchPart } from '../../types';

export type SourceKind = 'CATALOG' | 'PRICE_LIST' | 'OFFICIAL' | 'ONLINE' | 'REVIEW';

export interface SearchResultPart extends SearchPart {
  price?: number | null;
  ean?: string | null;
  ncm?: string | null;
  officialName?: string | null;
  masterCategory?: string | null;
  brand?: string | null;
  source?: 'CATALOG';
}

export type CommercialPart = {
  id: string;
  partNumber: string;
  normalizedNumber: string;
  name: string;
  application: string | null;
  applications?: string[];
  price: number | null;
  ean: string | null;
  ncm: string | null;
  classCode: string | null;
  priceSections: string[];
  references: string[];
  productCategories: string[];
  score: number;
  source: 'PRICE_LIST';
};

export type PriceSection = { name: string; count: number };

export type SearchDocument = {
  id: string;
  filename: string;
  manufacturer: string | null;
  model: string | null;
  pnc: string | null;
  partCount: number;
};

export type SearchStreamMessage = {
  type: 'lexical' | 'semantic' | 'done';
  parts?: SearchResultPart[];
  documents?: SearchDocument[];
  error?: string;
};

export type HusqvarnaLivePart = {
  name?: string;
  imageUrl?: string;
  replacedBy?: string;
  fitsTo?: string[];
  originalPartUrl?: string;
  specifications?: {
    ean?: string | null;
    netWeight?: string | null;
    grossWeight?: string | null;
  };
};

export type PdfPreview = { url: string; page: number | null; title: string };

export type WorkContext = {
  location: {
    value: string;
    note: string | null;
    updatedAt: string;
    updatedBy: string | null;
  } | null;
  popularParts: Array<{ partNumber: string; name: string; model: string | null; count: number }>;
  frequentlyTogether: Array<{ partNumber: string; name: string; model: string | null; count: number; percentage: number }>;
  togetherSampleSize: number;
  togetherReady: boolean;
  priceSections: string[];
  application: string | null;
  applications?: string[];
  sources: Array<{ type: SourceKind; label: string; detail: string }>;
  officialFallback: { url: string; automatic: boolean };
};

export type OfficialFallbackResult = {
  status: 'FOUND' | 'REVIEW';
  source: 'OFFICIAL' | 'ONLINE';
  query: string;
  partNumber?: string;
  name?: string;
  imageUrl?: string | null;
  replacedBy?: string | null;
  fitsTo?: string[];
  specifications?: HusqvarnaLivePart['specifications'] | null;
  url: string;
  message?: string;
};
