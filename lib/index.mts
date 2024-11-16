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

// Пример обновленного меню документации с указанием директорий
const module = (await importUserFile(config)) as {
  question: (
    item: ThemeMenuItem,
    menupath: MenuItem[],
    history: HistoryItem[],
    sidebar: {
      sidebar: Record<string, SidebarItem[]>,
      sidebarWithFilenames: Record<string, SidebarItem[]>
    }
  ) => string,
  menu: Menu
};

const {
  menu: json,
  question,
} = module


function stringOnLevel(item: MenuItem, level: number = 0) {
  return `
    ${level === 0 ? `Категория: ${item.title}`: `  - ${item.title}`}
  `
}
const generateMenuString = (menu: MenuItem[], level: number = 0) => {
  return menu.reduce((acc, item, index): string => {
    return acc + '\n' + stringOnLevel(item, index) + (item.items ? generateMenuString(item.items, level + 1): '')
  }, '')
}

interface GenerateSidebarOptions {
  widthExtension: boolean
  withIndexFile: boolean
}

const defaultObject: GenerateSidebarOptions = {
  widthExtension: false,
  withIndexFile: false
}

function generateSidebar(menu: Menu, {widthExtension, withIndexFile,} = defaultObject): Record<string, SidebarItem[]> {
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

  return {
    [menu.base]: traverse(menu.items)
  };
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

const SidebarMenu = generateSidebar(json)
fs.writeFileSync(path.join(out, 'sidebar-menu.json'), JSON.stringify(SidebarMenu, null, ' '), 'utf-8');

console.log(`Записан JSON для сайдбара документации`)
const SidebarMenuWithFilenames = generateSidebar(json, {widthExtension: true, withIndexFile: true,})
fs.writeFileSync(path.join(out, 'sidebar-menu-with-filenames.json'), JSON.stringify(SidebarMenuWithFilenames, null, ' '), 'utf-8');
console.log(`Записан JSON для сайдбара документации с расширениями`)


export type HistoryItem = {
  item: MenuItem
  text: string
  filePath: string
}
const history: HistoryItem[] = []


function safetyReadFileContent(filePath: string): string | undefined {
  if (fs.existsSync(filePath)) {
    return fs.readFileSync(filePath, 'utf-8')
  }
}


// Рекурсивная функция для генерации документации
async function generateDocumentation(items: MenuItem[], baseDir: string = '', menupath: MenuItem[]): Promise<void> {
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

        const dontUsePreviousFilesAsContext = [...menupath, item].some(item => item.dontUsePreviousFilesAsContext)

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
  
          const dontAddToContext = [...menupath, item].some(item => item.dontAddToContext)
  
          if (!dontAddToContext) {
            history.push({
              item,
              filePath,
              text: fileContent
            })
          }
        } while (needEdit)
      } else {
        const dontAddToContext = [...menupath, item].some(item => item.dontAddToContext)
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


// const divider = '---%%%---%%%---'

// const question = (item: ThemeMenuItem, menupath: MenuItem[], history: HistoryItem[]) => `
// Мы с тобой пишем документацию для проекта, который помогает людям строить частные дома самостоятельно или с помощью бригад/подрядчиков 
// нужно дать им полную информацию для самостоятельного ознакомления, не только чтоб строить но и при необходимости контролировать кажое дейтвие подрядчиков, 
// как работу так и закупки.
// Еще наш проект дает людям не только строительный справочник, а еще и дает полностью всю проектную документацию к домам из каталога домов беслпатно, 
// но не в чистом виде, а в виде инструкции к постройке по проектной документации. Мы даем инструкцию, в которой вырезки из полной проектной документации к постройке от и до.
// Вот тебе структура моего проекта, то какие есть категории и темы, и ссылки на файлы маркдаун. 

// ${JSON.stringify(SidebarMenuWithFilenames, null, ' ')}

// Ты пишешь по очереди сверху вниз каждую эту тему, и те темы, которые ты описал будут сверху и будут разделяться с помощью "${divider}".
// Удали этот разделитель в финальной генерации.

// Тебе нужно раскрыть тему, которая описана в самом низу.
// Не забывай делать относительные ссылки между файлами чтоб не повторяться, но делай их с умом в контенте, если это действительно нужно.
// И делай ссылки только на будующий контент, на тот который был ранее - делать перелинковку не нужно.
// Также просто перелинковка в виде меню мне не нужна, так как у меня уже есть меню, но если на странице будет очень много контента то можно в верхней части сделать блок "содержание".

// Не забывай, что мы рассказываем в контексте России, поэтому, если имеет смысл, то можно приводить примеры для разных климатических зон России, и с Российскими нормативами.

// Вот контент который у меня уже есть
// ${
//   history.map(item => `
// Тема: ${item.item.title}
// Путь до файла: ${item.filePath}
// Контент: ${item.text}

// ${divider}

// `)
// }

// Теперь необходимо сгенерировать контент для темы: ${item.title},
// и вот к ней комментарий:
// ${menupath.length ? menupath.map(item => item.baseContent).join('\n'): ''}
// ${item.content}
// `


// Запускаем генерацию документации
generateDocumentation(json.items, '', []).then(() => {
  console.log('Процесс генерации завершен.');
}).catch((error) => {
  console.error('Произошла ошибка при генерации документации:', error);
});

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