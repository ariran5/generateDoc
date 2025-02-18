
export interface RunProps {
  language: string;
  framework: string;
  model: string;
  maxDepth?: number;
  outDir: string;
  baseDir: string;
  includePatterns: string[];
  ignorePatterns: string[];
}

export interface FileContext {
  path: string;
  content: string;
  dependencies: Dependency[];
  functions: FunctionInfo[];
  classes: ClassInfo[];
  updatedAt: number;
}

export interface Dependency {
  path: string;
  exports: string[];
}

export interface FunctionInfo {
  name: string;
  parameters: Param[];
  returnType: string;
  description: string;
}

export interface ClassInfo {
  name: string;
  methods: MethodInfo[];
}

export interface MethodInfo extends FunctionInfo {
  isStatic: boolean;
}

export interface Param {
  name: string;
  type: string;
}