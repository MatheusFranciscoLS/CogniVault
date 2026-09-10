import type { SearchPart } from '../../types';

export interface SearchResultPart extends SearchPart {
  price?: number | null;
  ean?: string | null;
  ncm?: string | null;
  officialName?: string | null;
  masterCategory?: string | null;
  brand?: string | null;
}

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
  specifications?: {
    ean?: string | null;
    netWeight?: string | null;
    grossWeight?: string | null;
  };
};

export type PdfPreview = {
  url: string;
  page: number | null;
  title: string;
};
