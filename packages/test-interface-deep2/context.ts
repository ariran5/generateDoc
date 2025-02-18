import fs from 'fs';
import path from 'path';
import { FileContext } from './types';

const CONTEXT_CACHE_FILE = '.testgen_cache.json';

export class ContextManager {
  private cache: Record<string, FileContext> = {};

  constructor(private baseDir: string) {
    this.loadCache();
  }

  private get cachePath() {
    return path.join(this.baseDir, CONTEXT_CACHE_FILE);
  }

  private loadCache() {
    try {
      this.cache = JSON.parse(fs.readFileSync(this.cachePath, 'utf-8'));
    } catch {
      this.cache = {};
    }
  }

  saveCache() {
    fs.writeFileSync(this.cachePath, JSON.stringify(this.cache, null, 2));
  }

  needsUpdate(filePath: string): boolean {
    const stat = fs.statSync(filePath);
    return !this.cache[filePath] || 
           this.cache[filePath].updatedAt < stat.mtimeMs;
  }

  updateContext(filePath: string, context: FileContext) {
    this.cache[filePath] = context;
    this.saveCache();
  }

  getContext(filePath: string): FileContext | undefined {
    return this.cache[filePath];
  }

  getAllContexts(): FileContext[] {
    return Object.values(this.cache);
  }
}