import fs from 'node:fs';
import path from 'node:path'
import { glob, GlobOptionsWithFileTypesUnset } from "glob";
import prompts from "prompts";
// import { ChatModel, generateText, generateTextAsMessages, Messages } from '../../lib/openAIClient.mjs'
import { ChatModel, generateText, generateTextAsMessages, Messages } from '../../lib/gigachatAIClient.mjs'
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

    changedFilesContext = await createOptimizedContext(
      changedFiles,
      model,
      generateText
    )
    write(
      Object.assign(oldCTX, changedFilesContext)
    )
  } catch (e) {
    console.log(e, 'Ошибка, не правильная работа с контекстом')
  }

  const littleContext = read()
  // const stringAboutFilesFromSmallContext = getContextAsString(
  //   littleContext,
  //   [...new Set([...files, ...filteredRefFiles])]
  // )
  const stringAboutFilesFromSmallContext = `
  This is my files about i know.

  ==== begin files block =====
  
  ${
    allRefFiles.map(item => {
      return `
      File Path: ${item}
      --- start file ${item} ---
      (${fs.readFileSync(item, 'utf-8')})

      --- end file ${item} ---

      `
    })
  }

  ==== end files block =====
  `

  const baseContext = (path: string) => {    
    return `
    У меня есть приложение и мне нужны для него тесты.
    Я пишу на языке программирования ${language} и мне нужны тесты на фреймворке ${framework}.
    
    Моя рабочая директория ${baseDir}. Используй относительные пути, если это необходимо.
    `
  }

  const fullAppContext = (path: string, content: string, comment?: string) => {
    const finalPath = getTestFilePath(path)

    return `
    Сгенерируй мне файл c тестами на языке ${language} и фреймворке ${framework}.
    Мы с тобой обсудили, какие могут быть тест кейсы, теперь создай файл с базовым кодом для тестов и опиши внутри каждый придуманной тобой текст теста.
    Файл будет лежать по пути ${finalPath}, используй эту информацию для генерации правильных импортов
    
    Пожалуйста, мой сладкий, сделай чтоб все было очень и очень хорошо, я заплачу тебе за эту работу очень много денег.

    Проверь все кейсы, включая краевые, но особое внимание удели основному функционалу.

    ${ comment ? '(дополнительно): ' + comment: ''}
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
            Далее короткое содержание файлов, которые есть у меня в проекте:

            ${stringAboutFilesFromSmallContext}
            ` + `
            А вот файл, на который нам необходимо написать тест.
            path: ${filePath}
            content: ${originalFileContent}
            `
          },
          {
            role: 'user',
            content: `
            Мне нужно написать тест для файла ${filePath}.
            Я хочу чтоб ты написал мне список того, что нужно протестировать.
            Список должен начинаться с 1 пункта и далее увеличивается на единицу.
            Если в файле не достаточно информации, то используй свои знания о кратком описании других файлов.
            Попытайся понять что делает этот файл и распиши мне подробно в виде списка то, что нужно протестировать.
            Ответь текстом без разметки, просто текст.
            `
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

        const withCorrectImports = result
        // const withCorrectImports = await generateTextAsMessages([
        //   ...messages,
        //   {
        //     role: 'assistant',
        //     content: result,
        //   },
        //   {
        //     role: 'user',
        //     content: `
        //     What imports need to be removed or added? Pay attention to the library imports for our task. Please do everything correctly, it would help me a lot. If you do a good job, I'll buy you a burger.

        //     Give me result as a final file after your work
        //     `
        //   }
        // ], model)

        // if (!withCorrectImports) {
        //   console.log(
        //     picocolors.bgRed(filePath + ': ' + 'no content "withCorrectImports"'))
        //   return
        // }

        const puteText = await generateTextAsMessages([
          {
            role: 'assistant',
            content: withCorrectImports,
          },
          {
            role: 'user',
            content: `отчисти все лишнее и пришли мне только код файла, который я вставлю в файл с расширением ${outExt}. Больше ничего, без объяснения, только код.`
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
      ==== Все что выше - это тест предыдущей генерации файла. В результате работы у нас получился файл, который я покажу ниже.
      
      Мы генерировали тесты для файла ${originalPath}:
      Путь к тестовому файлу ${changeFile}
      Содежание файла с тестами:
      ${testFile}

      ====
      ${baseContext(originalPath)}
      Мне нужно поменять мою генерацию, вот что я хочу:
      ${propmt}
      `
      
      console.log('Generation: ' + originalPath)

      const messages: Messages = [
        {
          role: 'system',
          content: `
            Далее короткое содержание файлов, которые есть у меня в проекте:

            ${stringAboutFilesFromSmallContext}
            ` + `
            А вот файл, на который нам необходимо написать тест.
            path: ${originalPath}
            content: ${originalFile}
          `
        },
        {
          role: 'user',
          content: contextForChange
        }
      ]

      const result = await generateTextAsMessages(messages, model)
      
      
      if (!result) {
        return
      }

      writeTestFile(originalPath, result)
      
      {
        const oldCTX = read()
        oldCTX[originalPath].generated = true
        oldCTX[originalPath].generatedFile = getTestFilePath(originalPath)
        write(oldCTX)
      }

      console.log('GenerationEnd: ' + originalPath)
      
    } while (true);
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
