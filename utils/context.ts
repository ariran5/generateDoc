import fs from 'node:fs'
import path from 'node:path'
import { neuroDocsDir } from "./constants";
import pLimit from 'p-limit';

const limit = pLimit(10)

import { generateText } from '../lib/openAIClient.mjs'

const optimizedFilename = '.optimized.json'

export async function createOptimizedContext(files: string[], model: string) {
  createFolder()
  const optimized: OptimizedContext = {}

  const parallel = files.map(file => {
    return limit(async () => {
      const stat = fs.statSync(file)
      const content = fs.readFileSync(file, 'utf-8')
      const result = await generateText(
        ` I has this file with programming code with extension ${path.extname(file)}.
        I want to get technical information about the file. I am testing the code in this file and need data on the functions it provides, their input and output parameters, and other objects present in the file, but write concisely and provide only the technical details without explanations.

        Don't use markdown. Respond me with pure text without formatting.

        ${content}
        `,
        // @ts-ignore
        model,
      )

      if (!result) {
        return
      }

      optimized[file] = {
        createdAt: stat.ctimeMs,
        updatedAt: stat.mtimeMs,
        result: result,
        generated: false,
      }
    })
  })

  await Promise.all(parallel)

  return optimized
}

export function createFolder(dir = '') {
  const fullpath = path.join(neuroDocsDir, dir)
  if (!fs.existsSync(fullpath) ) {
    fs.mkdirSync(fullpath, {recursive: true})
  }
}

export interface OptimizedContext {
  [key: string]: {
    createdAt: number;
    updatedAt: number;
    result: string;
    generated: boolean;
    /**
     * Путь к сгенерированному файлу
     */
    generatedFile: string;
  }
}

export function write(obj: OptimizedContext) {
  const filepath = path.join(neuroDocsDir, optimizedFilename)

  if (!fs.existsSync(neuroDocsDir)) {
    createFolder();
  }
  fs.writeFileSync(filepath, JSON.stringify(obj, null, ' '), { encoding: 'utf-8'})
}

export function read(): OptimizedContext {
  const filepath = path.join(neuroDocsDir, optimizedFilename)

  try {
    return JSON.parse(fs.readFileSync(filepath, { encoding: 'utf-8'})) as OptimizedContext
  } catch (error) {
    return {}
  }
  
}

export function getContextAsString(context: OptimizedContext, files: string[]): string {
  const fullAppContext = Object
    .entries(context)
    .filter(item => {
      return files.includes(item[0])
    })
    .map(([filepath, item]) => `
file path: ${path.resolve(filepath)}
file description: ${item.result}`
    )
    .join('\n')
  return fullAppContext
}

export async function addFileToContext(path: string, model: string) {
  const newCTX = await createOptimizedContext([path], model)
  const old = read()

  write(
    Object.assign(old, newCTX)
  )
}

export async function removeFileFromContext(path: string) {
  const old = read()

  delete old[path]

  write(old)
}