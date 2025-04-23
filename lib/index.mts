#!/usr/bin/env tsx --env-file=.env
import fs from 'fs';
import path from 'path';
import { Menu, MenuItem, ThemeMenuItem } from './json.mjs';
import OpenAI from 'openai';
import prompts from 'prompts';
import minimist from 'minimist';
import { importUserFile } from './importFromUserFolder.mjs';
import { extractShortContext, template } from './shortContext.mjs';
import pc from 'picocolors';
import { generateText } from './openAIClient.mjs'

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

export type SidebarItem = {
  text?: string
  link?: string
  items?: SidebarItem[]
  collapsed?: boolean
  base?: string
  docFooterText?: string
  rel?: string
  target?: string
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


// Пример обновленного меню документации с указанием директорий
const module = (await importUserFile(config)) as {
  question: QuestionFN,
  menu: Menu[]
};

const {
  menu,
  question,
} = module


interface GenerateSidebarOptions {
  widthExtension: boolean
  withIndexFile: boolean
}

const defaultObject: GenerateSidebarOptions = {
  widthExtension: false,
  withIndexFile: false
}

function addLastSymbolIfMissing(str: string, symbol: string) {
  if (!str.endsWith(symbol)) {
    return str + symbol;
  }
  return str;
}

function generateSidebar(menu: Menu[], {widthExtension, withIndexFile,} = defaultObject): Record<string, SidebarItem[]> {
  const traverse = (items: MenuItem[], baseDir = ''): SidebarItem[] => {
    return items.map(item => {
      const { dir, filename,} = item
      const pathWithDir = dir ? path.posix.join(baseDir, dir) : baseDir
      const pathWithFilename = filename ? path.posix.join(pathWithDir, filename) : baseDir

      let finalPathWithFilename = pathWithFilename
      if (!withIndexFile) {
        finalPathWithFilename = finalPathWithFilename.replace('index' + extension, '')
      }
      if (!widthExtension) {
        finalPathWithFilename = finalPathWithFilename.replace(extension, '')
      }
      
      const sidebarItem: SidebarItem = {
        text: item.title,
        link: finalPathWithFilename,
      };
      if (!filename) {
        delete sidebarItem.link
      }
      if (item.items && item.items.length > 0) {
        sidebarItem.items = traverse(item.items, pathWithDir);
      }
      return sidebarItem;
    });
  };

  return menu.reduce<Record<string, SidebarItem[]>>((acc, item) => {
    const base = addLastSymbolIfMissing(item.base, '/')
    acc[base] = traverse(item.items, base)
    return acc
  }, {})
}

// Убедитесь, что базовая директория out существует
const docsPath = path.join(__dirname, out);
if (!fs.existsSync(docsPath)) {
  fs.mkdirSync(docsPath, { recursive: true });
  console.log(`Создана базовая директория: ${docsPath}`);
}

const SidebarMenu = generateSidebar(menu)
fs.writeFileSync(path.join(out, 'sidebar-menu.json'), JSON.stringify(SidebarMenu, null, ' '), 'utf-8');

console.log(`Записан JSON для сайдбара документации`)
const SidebarMenuWithFilenames = generateSidebar(menu, {widthExtension: true, withIndexFile: true,})
fs.writeFileSync(path.join(out, 'sidebar-menu-with-filenames.json'), JSON.stringify(SidebarMenuWithFilenames, null, ' '), 'utf-8');
console.log(`Записан JSON для сайдбара документации с расширениями`)


export type HistoryItem = {
  item: MenuItem
  text: string
  filePath: string
  optimizedContext?: string
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

  function findValueByKeyFromMenuPath<T extends keyof Menu | keyof MenuItem>(path: [Menu, ...MenuItem[]], key: T): boolean {
    // @ts-ignore
    return Boolean(path.toReversed().find(item => key in item)?.[key])
  }

  // если changeMode - boolean, то выбираем страницу для изменения, если changeMode - string, то используем этот prompt
  let itemForChange: {selectedFilename:{title: string, value: string}} | null = null
  if (typeof changeMode === 'boolean' && changeMode) {
    itemForChange = await prompts({
      type: 'autocomplete',
      name: 'selectedFilename',
      message: 'Выберите страницу которую нужно изменить',
      choices: pagesListForChanges(),
    })
  } else if (typeof changeMode === 'string') {
    const finded = pagesListForChanges().find(item => {
      return path.posix.normalize(item.value) === path.posix.normalize('/' + changeMode)
    })
    if (finded) {
      itemForChange = {selectedFilename: finded}
    }
  }

  // Рекурсивная функция для генерации документации
  async function generateDocumentation({items, baseDir, menupath}: GenerateProps): Promise<void> {
    for (const item of items) {
      const isContentItem = 'content' in item;
      const dontUsePreviousFilesAsContext = findValueByKeyFromMenuPath([...menupath, item], 'dontUsePreviousFilesAsContext')
      const isOptimizedContext = findValueByKeyFromMenuPath([...menupath, item], 'optimizedContext')

      if (isContentItem) {
        const { title, content, dir, filename, items: subItems } = item;

        console.log('Начата генерация: ' + title);
    
        if (!filename) {
          console.log('Нет имени файла: ' + item.title);
        }
  
        // Определяем директорию: используем указанную или базовую
        const finalURL = dir ? path.join(baseDir, dir.replace('/', '')) : baseDir;
        const finalDir = path.join(__dirname, out, finalURL)
        const filePath = path.join(finalDir, filename);

        await generateFile(item)
          
        async function generateFile(item: ThemeMenuItem){
          // Создать директорию, если необходимо
          if (!fs.existsSync(finalDir)) {
            fs.mkdirSync(finalDir, { recursive: true });
            console.log(`Создана директория: ${finalDir}`);
          }

          // Если нет файла, то создаем
          if (!fs.existsSync(filePath) || itemForChange?.selectedFilename?.value === path.join(finalURL, filename)) {
            // Записываем содержимое в файл
            // const result = withQuestions ? await prompts({
            //   type: 'confirm',
            //   name: 'value',
            //   message: `Запускаем генерацию  ${item.title}?`
            // }): {value: true}
            // if (!result.value) {
            //   process.exit(1);
            // }
            
            let needEdit = false;
            let generatedContentForChange = '';

            if (itemForChange?.selectedFilename) {
              const content = safetyReadFileContent(filePath)?.trim() ?? ''
              const shortContext = extractShortContext(content)?.[0] ?? ''
              const finalContent = shortContext ? content.replace(shortContext, ''): content
              console.log(content.length,)
              if (content) {
                needEdit = true;
                generatedContentForChange = finalContent
              }
            }
    
            do {
              // Генерируем содержание с помощью OpenAI
              const prompt = question(item, menupath, dontUsePreviousFilesAsContext ? []: history, {sidebar: SidebarMenu, sidebarWithFilenames: SidebarMenuWithFilenames})
    
              const promptFinal = needEdit ? (
                prompt + '\n' + `Контент для этого вопроса уже был создан, вот он (${generatedContentForChange})
                и теперь нужно изменить его, а именно, ` + (
                  consolePrompt ? consolePrompt: await prompts({type: 'text', name: 'prompt', message: 'Что изменить ?'})).prompt
              ) : prompt;
              
              const fileContent = await generateText(promptFinal, model!)
              if (!fileContent) {
                console.log('Не удачная генерация, какая-то проблема')
                process.exit(1);
              }
  
              const optimizedContextContent = isOptimizedContext ? await generateText(`
              У меня есть файл, в этом файле есть такой текст:
              ${fileContent}
  
              Расскажи коротко о том, что в этом файле, но не упускай важные моменты.
              `, model!): undefined
      
              fs.writeFileSync(
                filePath,
                fileContent + (isOptimizedContext ? template(optimizedContextContent!): ''),
                'utf8'
              );
              console.log('\x1b[36m%s\x1b[0m', `Файл ${filePath} был сгенерирован.`);
      
              needEdit = withQuestions ? (await prompts({
                type: 'confirm',
                name: 'value',
                message: `Изменить эту генерацию ${item.title}?`
              })).value : false;
    
              if (needEdit) {
                generatedContentForChange = fileContent
                continue;
              } else if (changeMode) {
                process.exit(0);
              }
      
              // @ts-ignore
              const dontAddToContext = findValueByKeyFromMenuPath([...menupath, item], 'dontAddToContext')
      
              if (!dontAddToContext) {
                const historyItem: HistoryItem = {
                  item,
                  filePath,
                  text: fileContent,
                }
                
                if (isOptimizedContext && optimizedContextContent) {
                  historyItem.optimizedContext = optimizedContextContent
                }
  
                history.push(historyItem)
              }
            } while (needEdit)
          } else {
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
              const match = extractShortContext(fileContent)

              if (match) {
                const [fullMatch, optimizedContextContent] = match

                historyItem.text = historyItem.text.replace(fullMatch, '')


                if (isOptimizedContext) {
                  historyItem.optimizedContext = optimizedContextContent.trim()
                }
              }

              history.push(historyItem)

              console.log(pc.yellow(`Восстановлен контекст ${item.title} из файла ` + filePath))
            }
          }
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
        const { title, dir, items: subItems } = item;
        console.log('Начата генерация: ' + title);
  
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