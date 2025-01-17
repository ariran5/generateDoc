import fs from 'node:fs';
import path from 'node:path'
import { glob, GlobOptionsWithFileTypesUnset } from "glob";
import prompts from "prompts";
import { ChatModel, generateText, generateTextAsMessages, Messages } from '../../lib/openAIClient.mjs'
// import { ChatModel, generateText, generateTextAsMessages, Messages } from '../../lib/gigachatAIClient.mjs'
import { createOptimizedContext, getContextAsString, OptimizedContext, read, write, } from '../../utils/context';
import pLimit from 'p-limit';
import { getIgnoredFiles } from '../../utils/dir'
import picocolors from 'picocolors';

const limit = pLimit(10)
const generateLimit = pLimit(5)

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
  model: ChatModel
  outExt?: string
  comment?: string
  base?: string
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
    outExt,
    comment,
    ref,
    base = './',
  } = options

  const baseDir = path.resolve(base)

  // const files = await readFilesRecursivelyAsPattern(pathPattern, ignore)
  const files = await glob(pathPattern, {
    // Adds a / character to directory matches.
    mark: true,
    nodir: true,
  })

  const filtered = gitignore ? getIgnoredFiles().add(out).add(ignore).filter(files) : files

  const allRefFiles = await glob(ref, {
    // Adds a / character to directory matches.
    mark: true,
    nodir: true,
  })

  const filteredRefFiles = gitignore ? getIgnoredFiles().add(out).add(ignore).filter(allRefFiles) : allRefFiles

  console.debug(picocolors.bgCyan('Файлов для генерации: ' + filtered.length))
  console.debug(picocolors.bgCyan('Файлов в контексте: ' + filteredRefFiles.length))

  let changedFiles: string[]
  let changedFilesContext: OptimizedContext

  try {
    const oldCTX = read()

    changedFiles = Array
      .from(new Set([...filtered, ...filteredRefFiles]))
      .filter(file => {
        if (file in oldCTX) {
          const data = oldCTX[file]
          const stat = fs.statSync(file)

          if (stat.mtimeMs !== data.updatedAt) {
            return true
          }
  
          return false
        }
  
        return true
      })

    changedFilesContext = await createOptimizedContext(changedFiles, model)
    write(
      Object.assign(oldCTX, changedFilesContext)
    )
  } catch (e) {
    console.log(e, 'Ошибка, не правильная работа с контекстом')
  }

  const nodePath = path
  const littleContext = read()
  const stringAboutFilesFromSmallContext = getContextAsString(
    littleContext,
    [...new Set([...files, ...filteredRefFiles])]
  )

  const baseContext = (path: string) => {
    const originalPath = nodePath.resolve(path)
    
    return `
    i have app, and i need tests for it.
    my app based on language ${language} and i need tests with framework ${framework}.
    
    I work in directory ${baseDir}. Use relative path for imports if it need.
    Parent file(original file) for generate test here ${originalPath}
    `
  }

  const fullAppContext = (path: string, content: string, comment?: string) => {
    const finalPath = getTestFilePath(path)

    return `
    now i need generate tests in plain text format without explanation for this file for insert code without formattings. NOT USE MARKDOWN.
    New generated file i put to dir ${finalPath}, use this information for correct import from this test file

    Please implement the entire code so I don't have to add anything

    ${ comment ? 'user comment: ' + comment: ''}
    `
  }

  let filesToGenerate: string[]
  {
    // вынес в блок кода чтоб не использовалась далее переменная actualCTX. Изолировал переменную.
    const actualCTX = read();
    filesToGenerate = filtered.filter(item => {
      // Написал отдельно условия чтоб было понятнее
      if (!existsTestFile(item)) {
        return true
      }
      
      if (!actualCTX[item].generated) {
        return true
      }

      return false
    })
  }

  if (filesToGenerate.length) {
    console.log(
      picocolors.green(`Added/changed files: ${filesToGenerate.length}\n`), filesToGenerate.join('\n'))

    await Promise.all(
      filesToGenerate.map((filePath, index) => generateLimit(async () => {
        const originalFileContent = fs.readFileSync(filePath, 'utf-8')
        
        let contextPhrase = fullAppContext(filePath, originalFileContent, comment)

        const messages: Messages = [
          {
            role: 'system',
            content: baseContext(filePath) + `
            this small description about all my files:

            ${stringAboutFilesFromSmallContext}
            ` + `
            File we will be working with:
            path: ${filePath}
            content: ${originalFileContent}
            `
          },
          {
            role: 'system',
            content: `
            this small description about all my files:

            ${stringAboutFilesFromSmallContext}
            `
          },
          {
            role: 'system',
            content: `
            File we will be working with:
            path: ${filePath}
            content: ${originalFileContent}
            `,
          },
          {
            role: 'user',
            content: `
            Respond using a numbered list, starting from 1 and continuing by points. Attempt to take into account whether this file utilizes anything from other files. If so, try to examine all suggested files in detail; for example, files might be used for re-export.


            Tell me, what tests would you like to conduct in this file? Provide me with a very detailed list so that the code coverage is close to 100%.`
          }
        ]

        console.log('Generation: ' + filePath)

        const testCases = await generateTextAsMessages(messages, model)

        {
          const match = testCases?.match(/Need file:? (.+?\))/gim)

          if (match) {
            console.log(picocolors.bgYellow('Need file: ' + match[1]))

            return
          }
        }

        messages.push({
          role: 'assistant',
          content: testCases
        })

        // messages.push({
        //   role: 'system',
        //   content: `
        //   The user will now want to generate files. You must be very careful and avoid making mistakes. Write the code in as much detaild as possible, include comments for this code, and make the corrent imports of necessary libraries and other files. When importing, use only not paths but also aliases if you know them.
        //   `
        // })

        messages.push({
          role: 'user',
          content: contextPhrase
        })

        const result = await generateTextAsMessages(messages, model)

        
        if (!result) {
          console.log(
            picocolors.bgRed(filePath + ': ' + 'no content "result"'))
            return
        }

        const withCorrectImports = await generateTextAsMessages([
          ...messages,
          {
            role: 'assistant',
            content: result,
          },
          {
            role: 'user',
            content: `
            What imports need to be removed or added? Pay attention to the library imports for our task. Please do everything correctly, it would help me a lot. If you do a good job, I'll buy you a burger.

            Give me result as a final file after your work
            `
          }
        ], model)

        if (!withCorrectImports) {
          console.log(
            picocolors.bgRed(filePath + ': ' + 'no content "withCorrectImports"'))
          return
        }

        const puteText = await generateTextAsMessages([
          {
            role: 'assistant',
            content: withCorrectImports,
          },
          {
            role: 'user',
            content: `Please, give me code as pure text because i whant insert your responce to my file. Dont use markdown and other, pure code for tests`
          }
        ], model)

        if (!puteText) {
          console.log(
            picocolors.bgRed(filePath + ': ' + 'no content "puteText"'))
          return
        }
  
        writeTestFile(filePath, puteText!)
        {
          const oldCTX = read()
          oldCTX[filePath].generated = true
          oldCTX[filePath].generatedFile = getTestFilePath(filePath)
          write(oldCTX)
        }
  
        console.log('GenerationEnd: ' + filePath)
      }))
    )

  } else {
    console.log(picocolors.red('Files not changed.'));
  }

  const {
    needChange,
  } = await prompts({
    type: 'confirm',
    message: 'Change any existed test file ?',
    name: 'needChange',
  })

  if (needChange) {
    do {
      const ctx = read()
      const listFilesForChange = filtered.map(item => ctx[item].generatedFile)
    
      const {
        changeFile
      } = await prompts({
        type: 'autocomplete',
        name: 'changeFile',
        message: 'Select file to change',
        choices: listFilesForChange.map(item => {
          return {
            title: item,
            value: item,
          }
        }),
        async suggest(input, choices) {
          return choices
            .filter(item => {
              return item.title.toLocaleLowerCase().includes(input) || item.value?.toLocaleLowerCase().includes(input)
            })
        },
      })

      if (changeFile === undefined) {
        process.exit(0)
      }

      const {
        propmt,
      } = await prompts({
        type: 'text',
        name: 'propmt',
        message: 'what do you whant to change ? You can type on your language',
      })

      if (propmt === undefined) {
        process.exit(0)
      }

      const originalPath = filtered.find(item => ctx[item].generatedFile == changeFile)

      if (!originalPath) {
        console.log(
          picocolors.bgRed('I can\'t find original file for this test file')
        )
        continue
      }

      const originalFile = fs.readFileSync(originalPath, 'utf-8')
      const testFile = fs.readFileSync(changeFile, 'utf-8')
        
      const contextPhrase = fullAppContext(changeFile, originalFile, comment)

      const contextForChange = `
      ${contextPhrase}
      ==== Previous text is old generation. Today i need change generated file based on this context.
      
      My current test file for ${originalPath}:
      ${testFile}

      ====
      Please, i give you many money, but make very good job for me. My comment for make change:
      ${propmt}
      `
      await generateFile(originalPath, contextForChange)
      
    } while (true);
  }

  function generateFile(filePath: string, content: string) {
    return generateLimit(async () => {
    
      if (!content) {
        return;
      }
      
      console.log('Generation: ' + filePath)

      const result = await generateText(content, model)
      
      
      if (!result) {
        return
      }

      writeTestFile(filePath, result)
      
      {
        const oldCTX = read()
        oldCTX[filePath].generated = true
        oldCTX[filePath].generatedFile = getTestFilePath(filePath)
        write(oldCTX)
      }

      console.log('GenerationEnd: ' + filePath)

      return result;
    })
  }

  function generateFileAsMessages(filePath: string, content: Messages) {
    return generateLimit(async () => {
    
      if (!content.length) {
        return;
      }
      
      console.log('Generation: ' + filePath)

      const result = await generateTextAsMessages(content, model)
      
      
      if (!result) {
        return
      }

      writeTestFile(filePath, result)
      
      {
        const oldCTX = read()
        oldCTX[filePath].generated = true
        oldCTX[filePath].generatedFile = getTestFilePath(filePath)
        write(oldCTX)
      }

      console.log('GenerationEnd: ' + filePath)

      return result;
    })
  }

  /**
   * 
   * @param filepath ссылка на исходный файл с кодом, НЕ ТЕСТ ФАЙЛ
   * @param content контекст для запроса в сетку
   */
  function writeTestFile(filepath: string, content: string) {
    const resultPath = getTestFilePath(filepath)

    fs.mkdirSync(path.dirname(resultPath), {recursive: true})
    fs.writeFileSync(resultPath, content, 'utf-8')
  }

  function readTestFile(filepath: string) {
    const resultPath = getTestFilePath(filepath)

    return fs.readFileSync(resultPath, 'utf-8')
  }


  function existsTestFile(filepath: string) {
    const resultPath = getTestFilePath(filepath)

    return fs.existsSync(resultPath)
  }

  function getTestFilePath(filepath: string) {
    const pathDiff = path.relative(base, filepath)
    const newFilepath = path.join(
      out,
      pathDiff
    )

    const extname = path.extname(filepath)
    const newFullpath = newFilepath.replace(extname, (outExt ?? '.test' + extname))

    return newFullpath
  }
}
