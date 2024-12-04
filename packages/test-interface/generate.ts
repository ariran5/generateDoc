import fs from 'node:fs';
import path from 'node:path'
import { glob, GlobOptionsWithFileTypesUnset } from "glob";

import prompts from "prompts";

import { generateText } from '../../lib/openAIClient.mjs'
import { createOptimizedContext, getContextAsString, read, write, } from '../../utils/context';
import pLimit from 'p-limit';
import { getIgnoredFiles } from '../../utils/dir'

const limit = pLimit(10)

export interface RunProps {
  // пути, которые надо игнорировать
  ignore: string[];
  // перетереть прошлые файлы
  replace: boolean;
  /**
   * Использовать ли gitignore, default true
   */
  gitignore: boolean,
  
  ref: string[]
  out: string
  optimized: boolean
  language: string
  framework: string
  model: string
}


export async function run(pathPattern: string, options: RunProps) {
  const globOptions: GlobOptionsWithFileTypesUnset = {}

  const {
    ignore,
    gitignore,
    language,
    framework,
    model,
    out,
  } = options

  // const files = await readFilesRecursivelyAsPattern(pathPattern, ignore)
  const files = await glob(pathPattern, {
    // Adds a / character to directory matches.
    mark: true,
    ignore,
    'nodir': false
  })

  const filtered = gitignore ? getIgnoredFiles().add(out).filter(files) : files

  console.debug(files)
  console.debug(filtered)

  const {
    confirm,
  } = await prompts({
    type: 'confirm',
    name: 'confirm',
    message: 'Create lightwere messages about files for optimizing context ?',
  })

  if (confirm) {
    write(await createOptimizedContext(filtered, model))
  }

  // const {
  //   text,
  // } = await prompts({
  //   type: 'text',
  //   name: 'text',
  //   message: 'What needs do ?',
  // })
  const nodePath = path
  const littleContext = read()
  const fullAppContext = (path, content) => `
i have app, and i need tests for it.
my app based on language ${language} and i need tests with framework ${framework}.

i show you my files for best result, but i show little descriptions about this files as context

${getContextAsString(littleContext)}


now i need generate tests in plain text format without explanation for this file for insert code without formattings. NOT USE MARKDOWN.
New generated file i put to dir ${nodePath.resolve(nodePath.join(out, path))}, use this information for correct import from this test file
original filepath: ${nodePath.resolve(path)}
content: ${content}
`
  const results = await Promise.all(
    filtered.map(item => {
      return limit(async () => {
        const content = fs.readFileSync(item, 'utf-8')
  
        if (!content) {
          return;
        }
  
        const contextPhrase = fullAppContext(item, fs.readFileSync(item, 'utf-8'))
  
        const result = await generateText(contextPhrase, model)
  
        return result;
      })
    })
  )

  const readedFiles = results.forEach((item, index) => {
    if (!item) {
      return;
    }

    const filepath = filtered[index]
    const newFilepath = path.join(out, filepath)
    const extname = path.extname(filepath)
    const newFullpath = newFilepath.replace(extname, '.test' + extname)
    fs.mkdirSync(path.dirname(newFullpath), {recursive: true})
    fs.writeFileSync(newFullpath, item, 'utf-8')
  })



}