#!/usr/bin/env tsx --env-file=.env
import fs from 'fs';
import path from 'path';
import OpenAI from 'openai';
import { Menu, MenuItem, ThemeMenuItem } from './json.mjs';
// import { json,} from '../json.mjs'
import prompts from 'prompts';
import minimist from 'minimist';
import { updateUsage, } from './usage.mjs'
import { importUserFile } from './importFromUserFolder.mjs';

const argv = minimist<{
  config?: string
  out?: string
  help?: boolean
  model?: OpenAI.Chat.ChatModel
  extension?: string
}>(process.argv.slice(2), {
  default: {
    help: false,
    config: 'neuro-docs.config.ts',
    out: 'docs',
    model: 'gpt-4o' as OpenAI.Chat.ChatModel,
    extension: '.md'
  },
  alias: {
    h: 'help',
    t: 'config',
    o: 'out',
    m: 'model',
    e: '.md',
  },
  string: ['_'],
})

const {
  config = 'doc-generator.ts',
  help,
  out = 'docs',
  model,
  extension: e,
} = argv

const extension = e!

console.log('Модель: ' + model)

console.log(process.cwd())
const __dirname = process.cwd();

const client = new OpenAI({
  apiKey: process.env['OPENAI_API_KEY'], // This is the default and can be omitted
});

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

function generateSidebar(menu: Menu[], {widthExtension, withIndexFile,} = defaultObject): Record<string, SidebarItem[]> {
  const traverse = (items: MenuItem[], baseDir = ''): SidebarItem[] => {
    return items.map(item => {
      const { dir, filename,} = item
      const pathWithDir = dir ? path.join(baseDir, dir) : baseDir
      const pathWithFilename = filename ? path.join(pathWithDir, filename) : baseDir

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
    acc[item.base] = traverse(item.items)
    return acc
  }, {})
}

// Генерация текста с помощью OpenAI
async function generateText(prompt: string,): Promise<string | null> {
  try {
    const response = await client.chat.completions.create({
      messages: [
        {
          role: 'user',
          content: prompt
        },
      ],
      model: model!,
    });

    const {
      completion_tokens,
      prompt_tokens,
      total_tokens,
    } = response.usage ?? {}

    if (response.usage) {
      updateUsage(response.usage)
    }

    console.log(`Промпт общей длиной ${prompt.length}, входящих/исходящий токенов ${prompt_tokens}/${completion_tokens}(${total_tokens})`)
    return response.choices[0].message.content;
  } catch (error) {
    console.error('Ошибка при генерации текста:', error);
    return null;
  }
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
}


function safetyReadFileContent(filePath: string): string | undefined {
  if (fs.existsSync(filePath)) {
    return fs.readFileSync(filePath, 'utf-8')
  }
}


async function run(){

  // Рекурсивная функция для генерации документации
  async function generateDocumentation(items: MenuItem[], baseDir: string = '', menupath: [Menu, ...MenuItem[]]): Promise<void> {
    for (const item of items) {
      if ('content' in item) {
        const { title, content, dir, filename, items: subItems } = item;
        console.log('Начата генерация: ' + title);
  
        if (!filename) {
          console.log('Нет имени файла: ' + item.title);
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
  
        // Если нет файла, то создаем
        if (!fs.existsSync(filePath)) {
          // Записываем содержимое в файл
          const result = await prompts({
            type: 'confirm',
            name: 'value',
            message: `Запускаем генерацию  ${item.title}?`
          })
  
          if (!result.value) {
            process.exit(1);
          }
  
          const dontUsePreviousFilesAsContext = [...menupath, item].some(item => 'dontUsePreviousFilesAsContext' in item && item.dontUsePreviousFilesAsContext)
  
          let needEdit = false;
          let generatedContentForChange = ''
  
          do {
  
            // Генерируем содержание с помощью OpenAI
            const prompt = question(item, menupath, dontUsePreviousFilesAsContext ? []: history, {sidebar: SidebarMenu, sidebarWithFilenames: SidebarMenuWithFilenames})
            console.log('==================== Размер контекста: ' + prompt.length);
  
            const promptFinal = needEdit ? (
              prompt + '\n' + `Контент для этого вопроса уже был создан, вот он (${safetyReadFileContent(filePath) || generatedContentForChange})
              и теперь нужно изменить его, а именно, ` + (await prompts({type: 'text', name: 'prompt', message: 'Что изменить ?'})).prompt
            ) : prompt;
    
            const generatedContent = await generateText(promptFinal) || 'Не удалось сгенерировать текст.';
            const fileContent = `${generatedContent}`;
    
            fs.writeFileSync(filePath, fileContent, 'utf8');
            console.log('\x1b[36m%s\x1b[0m', `Файл ${filePath} был сгенерирован.`);
    
            needEdit = (await prompts({
              type: 'confirm',
              name: 'value',
              message: `Изменить эту генерацию ${item.title}?`
            })).value
  
            if (needEdit) {
              generatedContentForChange = fileContent
              continue;
            }
    
            const dontAddToContext = [...menupath, item].some(item => 'dontAddToContext' in item && item.dontAddToContext)
    
            if (!dontAddToContext) {
              history.push({
                item,
                filePath,
                text: fileContent
              })
            }
          } while (needEdit)
        } else {
          const dontAddToContext = [...menupath, item].some(item => 'dontAddToContext' in item && item.dontAddToContext)
          // Восстанавливаем контекст если файл уже есть
          if (!dontAddToContext) {
            history.push({
              item,
              filePath,
              text: safetyReadFileContent(filePath)!
            })
            console.log('\x1b[33m%s\x1b[0m', `Восстановлен контекст ${item.title} из файла ` + filePath)
          }
        }
  
        // Обрабатываем подуровни, если они существуют
        if (subItems && subItems.length > 0) {
          await generateDocumentation(subItems, finalURL, [...menupath, item]);
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
          await generateDocumentation(subItems, finalURL, [...menupath, item]);
        }
      }
      
    }
  }

  const history: HistoryItem[] = []

  for (const item of menu) {
    // Запускаем генерацию документации
    await generateDocumentation(item.items, item.base || '', [item]).then(() => {
      console.log('Процесс генерации завершен.');
    }).catch((error) => {
      console.error('Произошла ошибка при генерации документации:', error);
    });

    history.length = 0
  }
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