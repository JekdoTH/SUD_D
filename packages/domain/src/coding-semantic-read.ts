export const CODING_SEMANTIC_READ_CAPABILITY_NAMES = Object.freeze([
  'code.overview',
  'code.find_symbol',
  'code.find_references',
  'code.search',
  'code.diagnostics',
] as const);

export type CodingSemanticReadCapabilityName = (typeof CODING_SEMANTIC_READ_CAPABILITY_NAMES)[number];

export interface CodingOverviewInput {
  readonly relativePath: string;
  readonly depth?: number;
}

export interface CodingFindSymbolInput {
  readonly namePathPattern: string;
  readonly relativePath?: string;
  readonly depth?: number;
  readonly includeBody?: boolean;
  readonly substringMatching?: boolean;
  readonly maxMatches?: number;
}

export interface CodingFindReferencesInput {
  readonly namePath: string;
  readonly relativePath: string;
}

export interface CodingSearchInput {
  readonly pattern: string;
  readonly relativePath?: string;
  readonly codeOnly?: boolean;
}

export interface CodingDiagnosticsInput {
  readonly relativePath: string;
  readonly startLine?: number;
  readonly endLine?: number;
  readonly minSeverity?: 1 | 2 | 3 | 4;
}

export type CodingSemanticReadRequest =
  | { readonly capability: 'code.overview'; readonly input: CodingOverviewInput }
  | { readonly capability: 'code.find_symbol'; readonly input: CodingFindSymbolInput }
  | { readonly capability: 'code.find_references'; readonly input: CodingFindReferencesInput }
  | { readonly capability: 'code.search'; readonly input: CodingSearchInput }
  | { readonly capability: 'code.diagnostics'; readonly input: CodingDiagnosticsInput };
