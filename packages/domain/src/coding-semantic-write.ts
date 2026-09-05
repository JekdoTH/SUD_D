export const CODING_SEMANTIC_WRITE_CAPABILITY_NAMES = Object.freeze([
  'code.replace_symbol',
  'code.insert_before',
  'code.insert_after',
  'code.rename',
] as const);

export type CodingSemanticWriteCapabilityName = (typeof CODING_SEMANTIC_WRITE_CAPABILITY_NAMES)[number];

export interface CodingReplaceSymbolInput {
  readonly namePath: string;
  readonly relativePath: string;
  readonly body: string;
}

export interface CodingInsertBeforeInput {
  readonly namePath: string;
  readonly relativePath: string;
  readonly body: string;
}

export interface CodingInsertAfterInput {
  readonly namePath: string;
  readonly relativePath: string;
  readonly body: string;
}

export interface CodingRenameInput {
  readonly namePath: string;
  readonly relativePath: string;
  readonly newName: string;
}

export type CodingSemanticWriteRequest =
  | { readonly capability: 'code.replace_symbol'; readonly input: CodingReplaceSymbolInput }
  | { readonly capability: 'code.insert_before'; readonly input: CodingInsertBeforeInput }
  | { readonly capability: 'code.insert_after'; readonly input: CodingInsertAfterInput }
  | { readonly capability: 'code.rename'; readonly input: CodingRenameInput };
