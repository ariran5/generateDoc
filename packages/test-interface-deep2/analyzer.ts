import fs from 'fs';
import { glob } from 'glob';
import { ContextManager } from './context';
import { FileContext, RunProps, } from './types';
import ig from 'ignore';
import { extractJson, tryes } from './utils';
import { createCompletention } from './LLM_Client'

export class CodeAnalyzer {
  projectFiles: string[] = [];

  constructor(
    private contextManager: ContextManager,
    private props: RunProps
  ) {
    this.initProjectFiles(props.includePatterns);
  }

  static getIgnoredFiles() {
    let ignored = ig()
    
    try {
      const gitignore = fs.readFileSync('.gitignore').toString()

      ignored = ig().add(gitignore)

    } catch (error) {
       console.log('Не обнаружен .gitignore')
    }

    return ignored
  }

  static getProjectFiles(pathPattern = '**/*', ) {
    const ignored = CodeAnalyzer.getIgnoredFiles()

    const files = glob.sync(pathPattern, {
      mark: true,
      ignore: {
        ignored(path) {
          return !ignored.filter([path.relativePosix()]).length
        },
        childrenIgnored(path) {
          const url = path.relativePosix()
  
          if (!url) {
            return false
          }
          return !ignored.filter([url]).length
        }
      },
      nodir: true,
    })

    return files
  }

  private initProjectFiles(pathPatterns: string[] = ['**/*']) {
    this.projectFiles = Array.from(
      new Set(
        ...pathPatterns.map(item => {
          return CodeAnalyzer.getProjectFiles(item)
        })
      )
    )
  }

  async getContextRequirements(mainFile: string): Promise<string[]> {
    const content = fs.readFileSync(mainFile, 'utf-8');

    const result = await tryes(async () => {
      const response = await createCompletention({
        model: this.props.model,
        messages: [{
          role: "system",
          content: `Analyze dependencies for ${mainFile}. 
          Respond with JSON array of string without markdown (needed file paths from this list):
          ${JSON.stringify(this.projectFiles)}`
        }, {
          role: "user",
          content: `File content:\n${content}`
        }],
        response_format: {
          type: 'json_object',
        } as const
      });
  
      try {
        return (JSON.parse(response.choices[0].message.content || '[]') as string[])
          .filter((file: string) => this.projectFiles.includes(file));
      } catch {
        return [];
      }
    })

    return result;
  }

  // async resolveContext(mainFile: string): Promise<FileContext[]> {
  //   const baseFile = await this.analyzeFile(mainFile);

  //   return tryes(async () => {

  //     const requiredFiles = await this.getContextRequirements(mainFile);
  //     const contexts = await Promise.all(
  //       requiredFiles.map(file => this.analyzeFile(file))
  //     );
      
  //     // Проверка полноты контекста
  //     const missing = await this.checkMissingDeps(baseFile, contexts);
  //     if (missing.length > 0) {
  //       console.warn('\nMissing files:', missing);
  //       throw new Error('Missing files')
  //     } else {
  //       return [baseFile, ...contexts];
  //     }
  //   })

  // }
  async *resolveContext2(mainFile: string): AsyncGenerator<number, FileContext[]> {
    const baseFile = await this.analyzeFile(mainFile);

    let tries = 2
    do {
      const requiredFiles = await this.getContextRequirements(mainFile);
      
      yield 1;

      const contexts = await Promise.all(
        requiredFiles.map(file => this.analyzeFile(file))
      );

      yield 2;
      
      // Проверка полноты контекста
      const missing = await this.checkMissingDeps(baseFile, contexts);

      yield 3;

      if (missing.length > 0) {
        console.warn('\n\nMissing files:\n' + missing.join('\n') + '\n');
      } else {
        return [baseFile, ...contexts];
      }
    } while (--tries);

    throw new Error('Missing files')
  }

  private async checkMissingDeps(baseFile: FileContext, contexts: FileContext[]): Promise<string[]> {
    const response = await createCompletention({
      model: this.props.model,
      messages: [{
        role: "system",
        content: `Check if context is complete. 
        Respond with JSON array of string without markdown (missing depencies as file paths or empty array)
        My file: ${baseFile.content}
        `
      }, {
        role: "user",
        content: `Current context files:
        ${contexts.map(c => c.path).join('\n')}`
      }]
    });

    try {
      return JSON.parse(response.choices[0].message.content || '[]');
    } catch {
      return [];
    }
  }

  async analyzeFile(filePath: string): Promise<FileContext> {
    if (!this.contextManager.needsUpdate(filePath)) {
      return this.contextManager.getContext(filePath)!;
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    const analysis = await this.getAIAnalysis(filePath, content);
    
    const context: FileContext = {
      path: filePath,
      content,
      ...analysis,
      updatedAt: Date.now()
    };

    this.contextManager.updateContext(filePath, context);
    return context;
  }

  private async getAIAnalysis<T = Pick<FileContext, 'classes' | 'dependencies' | 'functions'>>(filePath: string, content: string): Promise<T> {
    let tries = 2;
    do {
      
      const response = await createCompletention({
        model: this.props.model,
        messages: [{
          role: "system",
          content: `Analyze code for test generation. Respond with JSON withot markdown: {
            "functions": [{
              "name": string,
              "parameters": {name: string, type: string}[],
              "returnType": string,
              "description": string
            }],
            "classes": [{
              "name": string,
              "methods": [{
                "name": string,
                "parameters": {name: string, type: string}[],
                "returnType": string,
                "description": string,
                "isStatic": boolean
              }]
            }],
            "dependencies": [{
              "path": string,
              "exports": string[]
            }]
          }`
        }, {
          role: "user",
          content: `File: ${filePath}\nCode:\n${content}`
        }],
        temperature: 0.1,
        response_format: {
          type: 'json_object',
        } as const
      });

      const resContent = response.choices[0].message.content
      
      if (!resContent) {
        continue;
      }

      const jsonText = extractJson(resContent)

      if (!jsonText) {
        continue;
      }
      
      return JSON.parse(jsonText) as T;
    } while (--tries);

    throw new Error('Не удалось сделать анализ файла ' + filePath)
  }
}