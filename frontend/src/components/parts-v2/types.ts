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

export type HusqvarnaPortalDocument = {
  title: string;
  type: 'IPL' | 'OM' | 'OTHER';
  url: string;
  date: string | null;
  language: string | null;
};

export type HusqvarnaIplSectionSummary = {
  id: string;
  name: string;
  imageUrl: string | null;
  referenceHeight: string | null;
  referenceWidth: string | null;
};

export type HusqvarnaOfficialCommercial = {
  partNumber: string;
  name: string;
  description?: string | null;
  price: number | null;
  ean?: string | null;
  ncm?: string | null;
  category?: string | null;
  brand?: string | null;
  applications?: Array<string | null>;
  references?: Array<string | null>;
};

export type HusqvarnaOfficialIplPart = {
  position: string | null;
  partNumber: string | null;
  name: string;
  description: string | null;
  quantity: number | null;
  comment: string | null;
  coordinates: string | null;
  url: string | null;
  replacementPartNumbers: string[];
  commercial: HusqvarnaOfficialCommercial | null;
};

export type HusqvarnaOfficialIplSection = {
  id: string;
  name: string;
  imageUrl: string | null;
  referenceHeight: number | null;
  referenceWidth: number | null;
  parts: HusqvarnaOfficialIplPart[];
};

export type HusqvarnaOfficialRelatedSparePart = {
  partNumber: string;
  name: string;
  description: string | null;
  commercialReference: string | null;
  url: string | null;
  imageUrl: string | null;
  commercial: HusqvarnaOfficialCommercial | null;
};

export type HusqvarnaOfficialSpecification = { group: string; name: string; value: string };

export type HusqvarnaOfficialFeature = {
  id: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  videoUrl: string | null;
  source: 'SHARED' | 'ADDITIONAL';
};

export type HusqvarnaOfficialProductDetails = {
  pnc: string;
  productName: string;
  model: string;
  categoryName: string | null;
  articleDescription: string | null;
  discontinued: boolean;
  portalUrl: string | null;
  publicSupportUrl: string | null;
  publicSupportVerifiedBy: 'PNC' | 'MODEL' | null;
  documents: Array<{
    title: string;
    type: string;
    languages: string[];
    fileFormat: string | null;
    url: string;
    lastUpdated: string | null;
    isLatest: boolean;
  }>;
  specifications: HusqvarnaOfficialSpecification[];
  variants: Array<{ pnc: string; description: string | null; specifications: HusqvarnaOfficialSpecification[] }>;
  features: HusqvarnaOfficialFeature[];
  accessories: Array<{ id: string; name: string; description: string | null; url: string | null; category: string | null; imageUrl: string | null; discontinued: boolean }>;
  alsoUsedIn: Array<{ kind: string; id: string; pnc: string | null; name: string; category: string | null; url: string | null; imageUrl: string | null; discontinued: boolean }>;
  spareParts: HusqvarnaOfficialRelatedSparePart[];
  iplSections: HusqvarnaOfficialIplSection[];
};

export type HusqvarnaOfficialPartDetails = {
  partNumber: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  officialUrl: string | null;
  replacedBy: string | null;
  replacementChain: Array<{ from: string; to: string }>;
  fitsTo: string[];
  specifications: Record<string, string | null | undefined> | null;
  commercial: HusqvarnaOfficialCommercial | null;
  sources: { graphql: boolean; portalScraper: boolean; commercial: boolean };
};

export type HusqvarnaOfficialSearchKind = 'PRODUCT' | 'ACCESSORY' | 'SPARE_PART' | 'DOCUMENT' | 'CATEGORY';

export type HusqvarnaOfficialSearchResult = {
  kind: HusqvarnaOfficialSearchKind;
  id: string;
  title: string;
  subtitle: string | null;
  pnc: string | null;
  partNumber: string | null;
  categoryName: string | null;
  portalUrl: string | null;
  imageUrl: string | null;
  discontinued: boolean;
  numberOfVariants: number | null;
  documentType: string | null;
  languages: string[];
  lastUpdated: string | null;
  productCount: number | null;
};

// Kept as an alias for older callers while the official search now returns
// products, accessories, spare parts, documents and categories.
export type HusqvarnaProductSearchResult = HusqvarnaOfficialSearchResult;

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
  kind?: 'PART' | 'PRODUCT_CATALOG';
  query: string;
  partNumber?: string;
  pnc?: string;
  name?: string;
  imageUrl?: string | null;
  replacedBy?: string | null;
  fitsTo?: string[];
  specifications?: HusqvarnaLivePart['specifications'] | null;
  discontinued?: boolean;
  categoryName?: string | null;
  articleDescription?: string | null;
  documents?: HusqvarnaPortalDocument[];
  iplSections?: HusqvarnaIplSectionSummary[];
  portalUrl?: string | null;
  url?: string | null;
  directProductUrl?: boolean;
  message?: string;
};
