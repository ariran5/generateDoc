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
          I want to get minimal information about this code, existed functions and functions API, functioal and other.

          Give me very small respond in pure text format.
          Give me technical information withot human information

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
  }
}

export function write(obj: OptimizedContext) {
  const filepath = path.join(neuroDocsDir, optimizedFilename)

  if (!fs.existsSync(neuroDocsDir)) {
    createFolder();
  }
  fs.writeFileSync(filepath, JSON.stringify(obj), { encoding: 'utf-8'})
}

export function read(): OptimizedContext {
  const filepath = path.join(neuroDocsDir, optimizedFilename)

  return JSON.parse(fs.readFileSync(filepath, { encoding: 'utf-8'})) as OptimizedContext
}

export function getContextAsString(context: OptimizedContext): string {
  const fullAppContext = Object
    .entries(context)
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