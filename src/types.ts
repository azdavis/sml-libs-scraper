export interface File {
  name: string;
  text: string;
}

export type MergedInfoMap = Map<string, MergedInfo>;

export interface MultiDef {
  items: string[];
  comment: string;
}

export interface Info {
  signatureName: string | null;
  structsAndFunctors: string[];
  comment: string[];
  specs: string[];
  defs: MultiDef[];
}

export interface MergedInfo {
  signatureName: string | null;
  structsAndFunctors: string[];
  comment: string[];
  defs: Def[];
  extra: Extra | null;
}

export interface Def {
  spec: string;
  comment: string | null;
}

export interface Extra {
  unused: Map<string, string>;
  duplicate: Map<string, string>;
  usedMultiple: Set<string>;
}

export interface Merged {
  defs: Def[];
  extra: Extra;
}
