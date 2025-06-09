#!/usr/bin/env tsx
import "dotenv/config.js";
// import dotenv from 'dotenv';

// const envPath = path.resolve(process.cwd(), '.env');
// console.log('123', envPath)
// dotenv.config({ path: envPath });

import fs from 'fs';
import path from 'path';
import { Menu, MenuItem, ThemeMenuItem } from './json.mjs';
import OpenAI from 'openai';
import prompts from 'prompts';
import minimist from 'minimist';
import { importUserFile } from './importFromUserFolder.mjs';
import { generateSidebar, SidebarItem } from './sidebar.mjs';
import pc from 'picocolors';
import { createCompletention } from './openAIClient2.mjs'

const noop = (content: string, context: FN_Context) => content

const argv = minimist<{
  config?: string
  out?: string
  help?: boolean
  model?: OpenAI.Chat.ChatModel
  extension?: string
  all?: boolean
  debug?: boolean
  changeMode?: string | boolean
  prompt?: string
}>(process.argv.slice(2), {
  default: {
    help: false,
    config: 'neuro-docs.config.ts',
    out: 'docs',
    model: 'gpt-4o' as OpenAI.Chat.ChatModel,
    extension: '.md',
    all: false,
    debug: false,
    changeMode: false,
    prompt: undefined
  },
  alias: {
    h: 'help',
    t: 'config',
    o: 'out',
    m: 'model',
    e: 'extension',
    a: 'all',
    c: 'changeMode',
    p: 'prompt'
  },
  string: ['_'],
})

const {
  config = 'doc-generator.ts',
  help,
  out = 'docs',
  model,
  extension: e,
  all,
  debug,
  changeMode,
  prompt: consolePrompt
} = argv

if (all && changeMode) {
  console.error(pc.red('all and changeMode not supported in one time'))
  process.exit(1);
}

const extension = e!

console.log(pc.bgGreen(pc.white('Модель: ' + model)))

const __dirname = process.cwd();

type FN_Context = {
  item: ThemeMenuItem,
  menupath: [Menu, ...MenuItem[]],
  history: HistoryItem[],
  sidebar: {
    sidebar: Record<string, SidebarItem[]>,
    sidebarWithFilenames: Record<string, SidebarItem[]>
  }
}
export type QuestionFN = (
  item: ThemeMenuItem,
  menupath: [Menu, ...MenuItem[]],
  history: HistoryItem[],
  sidebar: {
    sidebar: Record<string, SidebarItem[]>,
    sidebarWithFilenames: Record<string, SidebarItem[]>
  }
) => string

export type PostProcessFN = (content: string, context: FN_Context) => string
// Пример обновленного меню документации с указанием директорий
const module = (await importUserFile(config)) as {
  question: QuestionFN,
  menu: Menu[]
  postProcess?: PostProcessFN
};

const {
  menu,
  question,
  postProcess = noop
} = module


// Убедитесь, что базовая директория out существует
const docsPath = path.join(__dirname, out);
if (!fs.existsSync(docsPath)) {
  fs.mkdirSync(docsPath, { recursive: true });
  console.log(`Создана базовая директория: ${docsPath}`);
}

const SidebarMenu = generateSidebar(menu)
{
  if (!fs.existsSync(path.join(out, 'sidebar-menu.json'))) {
    fs.writeFileSync(path.join(out, 'sidebar-menu.json'), '{}', 'utf-8');
  }

  const oldSidebarMenu = fs.readFileSync(path.join(out, 'sidebar-menu.json'), 'utf-8')
  if (oldSidebarMenu !== JSON.stringify(SidebarMenu, null, ' ')) {
    fs.writeFileSync(path.join(out, 'sidebar-menu.json'), JSON.stringify(SidebarMenu, null, ' '), 'utf-8');
    console.log(`Записан JSON для сайдбара документации`)
  }
}

console.log(`Записан JSON для сайдбара документации`)
const SidebarMenuWithFilenames = generateSidebar(menu, {withExtension: true, withIndexFile: true, extension})
{
  if (!fs.existsSync(path.join(out, 'sidebar-menu-with-filenames.json'))) {
    fs.writeFileSync(path.join(out, 'sidebar-menu-with-filenames.json'), '{}', 'utf-8');
  }

  const oldSidebarMenu = fs.readFileSync(path.join(out, 'sidebar-menu-with-filenames.json'), 'utf-8')
  if (oldSidebarMenu !== JSON.stringify(SidebarMenuWithFilenames, null, ' ')) {
    fs.writeFileSync(path.join(out, 'sidebar-menu-with-filenames.json'), JSON.stringify(SidebarMenuWithFilenames, null, ' '), 'utf-8');
    console.log(`Записан JSON для сайдбара документации с расширениями`)
  }
}

function toPosixPath(str?: string) {
  if (!str) {
    return str;
  }

  return str.replaceAll('\\', '/')
}

export type HistoryItem = {
  item: MenuItem
  text: string
  filePath: string
}


function safetyReadFileContent(filePath: string): string | undefined {
  if (fs.existsSync(filePath)) {
    return fs.readFileSync(filePath, 'utf-8')
  }
}

const pagesListForChanges = () => {
  function toFlat(items: SidebarItem[]): SidebarItem[] {
    return items.flatMap<SidebarItem>(item => {
      if (item.items) {
        return [item, ...toFlat(item.items)]
      }

      return item
    })
  }

  const a = Object.entries(SidebarMenuWithFilenames)
    .map(([key, value]) => {
      return [key, toFlat(value)] as const
    })
  
  return structuredClone(a)
    .flatMap(([key, values]) => {
      values
        .forEach(item => {
          item.text = item.text + ' ' + key;
        })

      return values;
    })
    .map(item => {
      return {
        title: item.text,
        value: item.link
      }
    })
    .filter((item): item is {title: string, value: string} => !!(item.title && item.value))
} 

const withQuestions = !all

async function run(){

  interface GenerateProps {
    items: MenuItem[]
    baseDir: string
    menupath: [Menu, ...MenuItem[]]
  }

  function findValueByKeyFromMenuPath<T extends keyof Menu | keyof MenuItem>(
    path: [Menu, ...MenuItem[]],
    key: T
  ): boolean {
    // @ts-ignore
    return Boolean(path.toReversed().find(item => key in item)?.[key])
  }

  // если changeMode - boolean, то выбираем страницу для изменения, если changeMode - string, то используем этот prompt
  let itemForChange: {title: string, value: string} | null = null
  if (typeof changeMode === 'boolean' && changeMode) {
    const value = await prompts({
      type: 'autocomplete',
      name: 'selectedFilename',
      message: 'Выберите страницу которую нужно изменить',
      choices: pagesListForChanges(),
    })
    if (value) {
      itemForChange = pagesListForChanges().find(item => item.value === value.selectedFilename)!
    }

  } else if (typeof changeMode === 'string') {
    const finded = pagesListForChanges().find(item => {
      return path.posix.normalize(item.value) === path.posix.normalize('/' + changeMode)
    })
    if (finded) {
      itemForChange = finded
    } else {
      console.log(pc.red('Страницы по этому пути нет'))
      process.exit(1);
    }
  }

  // Рекурсивная функция для генерации документации
  async function generateDocumentation({items, baseDir, menupath}: GenerateProps): Promise<void> {
    for (const item of items) {
      const isContentItem = 'content' in item;
      const dontUsePreviousFilesAsContext = findValueByKeyFromMenuPath([...menupath, item], 'dontUsePreviousFilesAsContext')

      if (isContentItem) {
        const { title, dir, filename, items: subItems } = item;

        console.log('Начата генерация: ' + title);

        if (!filename) {
          console.log('Нет имени файла в JSON конфиге: ' + item.title);
          process.exit(1);
        }
  
        // Определяем директорию: используем указанную или базовую
        const finalURL = dir ? path.join(baseDir, dir.replace('/', '')) : baseDir;
        const finalDir = path.join(__dirname, out, finalURL)
        const filePath = path.join(finalDir, filename);

          
        // Создать директорию, если необходимо
        if (!fs.existsSync(finalDir)) {
          fs.mkdirSync(finalDir, { recursive: true });
          console.log(`Создана директория: ${finalDir}`);
        }

        // if (changeMode && consolePrompt) {
        //   if (toPosixPath(itemForChange?.value) !== toPosixPath(path.posix.join(finalURL, filename))) {
            
        //   }
        // }

        let fileContent: string | undefined

        if (!fs.existsSync(filePath)) {
          fileContent = await generateFile(item)
        }

        if (toPosixPath(itemForChange?.value) === toPosixPath(path.posix.join(finalURL, filename))) {
          fileContent = await generateFile(item)
        }


        async function generateFile(item: ThemeMenuItem){
          let needEdit = Boolean(itemForChange?.value);
          let generatedContentForChange = fs.existsSync(filePath) ? safetyReadFileContent(filePath) : '';
  
          do {
            // Генерируем содержание с помощью OpenAI
            const prompt = question(item, menupath, dontUsePreviousFilesAsContext ? []: history, {sidebar: SidebarMenu, sidebarWithFilenames: SidebarMenuWithFilenames})
  
            const promptFinal = needEdit ? (
              prompt + '\n' + `Контент для этого вопроса уже был создан, вот он (${generatedContentForChange})
              и теперь нужно изменить его, а именно, ` + (
                consolePrompt ? 
                  consolePrompt:
                  await prompts({type: 'text', name: 'prompt', message: 'Что изменить ?'}).then(res => res.prompt)
              )
            ) : prompt;
            
            const res = await createCompletention({
              model: model!,
              messages: [
                {
                  role: 'system',
                  content: `
                  Ответ должен быть в формате markdown, который поддерживается vitepress, а значит имеет некоторые расширенные возможности. Можно их использовать.
                  `
                },
                {
                  role: 'user',
                  content: promptFinal
                }
              ],
            })

            const fileContent = res.choices[0].message.content

            if (!fileContent) {
              console.log('Не удачная генерация, какая-то проблема')
              process.exit(1);
            }


            if (changeMode && consolePrompt) {
              // Если changeMode и consolePrompt, то выходим, так как генерация разовая
              process.exit(0);
            }

            if (fileContent) {
              let finalNewFileContent = fileContent
              if (postProcess) {
                finalNewFileContent = postProcess(fileContent, {
                  item,
                  menupath,
                  history: dontUsePreviousFilesAsContext ? []: history,
                  sidebar: {sidebar: SidebarMenu, sidebarWithFilenames: SidebarMenuWithFilenames}
                })
              }

              fs.writeFileSync(
                filePath,
                finalNewFileContent,
                'utf8'
              );

              console.log('\x1b[36m%s\x1b[0m', `Файл ${filePath} был сгенерирован.`);
            }
    
            needEdit = withQuestions ? (await prompts({
              type: 'confirm',
              name: 'value',
              message: `Изменить эту генерацию ${item.title}?`
            })).value : false;
  
            if (needEdit) {
              generatedContentForChange = fileContent
              continue;
            } else {
              return fileContent
            }
    
          } while (needEdit)
        }

        // Восстанавливаем контекст если файл уже есть
        // @ts-ignore
        const dontAddToContext = findValueByKeyFromMenuPath([...menupath, item], 'dontAddToContext')
        if (!dontAddToContext) {
          const fileContent = safetyReadFileContent(filePath)!

          const historyItem: HistoryItem = {
            item,
            filePath,
            text: fileContent,
          }
          if (!fileContent) {
            console.log(fileContent, filePath)
          }

          history.push(historyItem)

          console.log(pc.yellow(`Восстановлен контекст ${item.title} из файла ` + filePath))
        }
  
        // Обрабатываем подуровни, если они существуют
        if (subItems && subItems.length > 0) {
          await generateDocumentation({
            items: subItems,
            baseDir: finalURL,
            menupath: [...menupath, item]
          });
        }
      } else {
        const { dir, items: subItems } = item;
        // console.log('Начата генерация: ' + title);
  
        // Определяем директорию: используем указанную или базовую
        const finalURL = dir ? path.join(baseDir, dir.replace('/', '')) : baseDir;
        const finalDir = path.join(__dirname, out, finalURL)
        
        // Создать директорию, если необходимо
        if (!fs.existsSync(finalDir)) {
          fs.mkdirSync(finalDir, { recursive: true });
          console.log(`Создана директория: ${finalDir}`);
        }
  
        if (subItems && subItems.length > 0) {
          await generateDocumentation({
            items: subItems,
            baseDir: finalURL,
            menupath: [...menupath, item]
          });
        }
      }
      
    }
  }

  const history: HistoryItem[] = []
  const tasks: Promise<void>[] = []


  for (const item of menu) {
    // Запускаем генерацию документации
    const task = generateDocumentation({
      items: item.items,
      baseDir: item.base || '',
      menupath: [item]
    })
      .then(() => {
        console.log('Процесс генерации завершен.');
      }).catch((error) => {
        console.error('Произошла ошибка при генерации документации:', error);
      });

    tasks.push(task)

    if (!all) {
      await task
    }
      

    history.length = 0
  }

  await Promise.all(tasks)
}

run()


// Меню с темами
// JSON с темами и ссылками на файлы
// Категория
// ее контент если есть
// тема, ее контент, ее ссылка
// тема, ее контент, ее ссылка

// Представь что ты читатель, и ты пытаешься узнать о постройке дома и идешь по моей документации шаг за шагом, чего тебе не хватает что стоит убрать ?

// const question = `
// Представь что ты читатель, и ты пытаешься узнать о постройке дома и идешь по моей документации шаг за шагом, чего тебе не хватает что стоит убрать ?
// Вот структура моего меню
// ${JSON.stringify(SidebarMenuWithFilenames, null, ' ')}
// `


// const res = await generateText(question)
// console.log(res)
