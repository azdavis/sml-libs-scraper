export interface File {
  name: string;
  text: string;
}

export type MergedInfoMap = Map<string, MergedInfo>;

export interface MultiDef {
  items: string[];
  comment: string | null;
}

export interface Info {
  comment: string[];
  signatureName: string | null;
  structsAndFunctors: string[];
  specs: string[];
  defs: MultiDef[];
}

export interface MergedInfo {
  comment: string[];
  signature: Signature | null;
  structsAndFunctors: string[];
  extra: Extra | null;
}

export interface Signature {
  name: string;
  specs: CommentedSpec[];
}

export interface CommentedSpec {
  def: string;
  comment: string | null;
}

export interface Extra {
  unused: Map<string, string>;
  duplicate: Map<string, string>;
  usedMultiple: Set<string>;
}

export interface Merged {
  specs: CommentedSpec[];
  extra: Extra;
}
