import fs from 'fs';
import path from 'path';
import OpenAI from 'openai';
import { fileURLToPath } from 'node:url';
import { json, Menu, MenuItem } from './json.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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
const menu: Menu = json


function stringOnLevel(item: MenuItem, level: number = 0) {
  return `
    ${level === 0 ? `Категория: ${item.title}`: `  - ${item.title}`}
  `
}
const generateMenuString = (menu: MenuItem[], level: number = 0) => {
  return menu.reduce((acc, item, index) => {
    return acc + '\n' + stringOnLevel(item, index) + (item.items ? generateMenuString(item.items, level + 1): '')
  }, '')
}

const contextFn = (prompt: string, description: string) => {
  return `
${ generateMenuString(menu.items) + `У нас есть меню и нам нужно с ним работать.`}
          
Я строю сервис документации на основе vitepress.
Мне необходимо используя структуру сайта, его категории и темы
заполнить страницы этой документации. Опиши пожалуйста детально тему ${prompt} в формате markdown так чтоб я сразу записал эту информацию в файл,
и детально раскрой каждый ее аспект. Напиши пожалуйста очень и очень подробно, напиши много текста, я хочу очень много текста для моей документации.

Это будет документация по строительству домов, язык должен быть не сильно технический а приятный пользователю, который по этой документации шаг за шагом будут строить свой дом, используй не только пункты а еще и пояснения к ним

${description ? 'Удели внимание и дополнительному комментарию к теме: ' + description: ''};

Весь контент для России.
`
}


function generateSidebar(menu: Menu): Record<string, SidebarItem[]> {
  const traverse = (items: MenuItem[], baseDir = ''): SidebarItem[] => {
    return items.map(item => {
      const { dir, filename,} = item
      const pathWithDir = dir ? path.join(baseDir, dir) : baseDir
      const pathWithFilename = filename ? path.join(pathWithDir, filename) : baseDir
      
      const sidebarItem: SidebarItem = {
        text: item.title,
        link: pathWithFilename.replace('.md', '').replace('/index', '/'),
      };
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
async function generateText(prompt: string, description: string = ''): Promise<string | null> {
  try {
    const response = await client.chat.completions.create({
      messages: [
        {
          role: 'user',
          content: contextFn(prompt, description)
        },
      ],
      model: 'o1-mini',
    });

    return response.choices[0].message.content;
  } catch (error) {
    console.error('Ошибка при генерации текста:', error);
    return null;
  }
}

// Рекурсивная функция для генерации документации
async function generateDocumentation(items: MenuItem[], baseDir: string = ''): Promise<void> {
  for (const item of items) {
    const { title, content, filename, items: subItems } = item;
    console.log('Начата генерация: ' + title);

    const finalFileName = filename ? filename : false;
    // Генерируем содержание с помощью OpenAI
    const generatedContent = (filename ? await generateText(title, content): false) || 'Не удалось сгенерировать текст.';

    // Определяем имя файла: используем указанное или генерируем из заголовка

    // Определяем директорию: используем указанную или базовую
    const finalDir = item.dir ? path.join(baseDir, item.dir) : baseDir;
    const filePath = finalFileName ? path.join(__dirname, 'docs', finalDir, finalFileName): false;

    const fileContent = `${generatedContent}\n`;

    // Создать директорию, если необходимо
    const dirPath = filePath ? path.dirname(filePath): finalDir;
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
      console.log(`Создана директория: ${dirPath}`);
    }

    // Записываем содержимое в файл
    if (filePath) {
      fs.writeFileSync(filePath, fileContent, 'utf8');
      console.log(`Файл ${filePath} был сгенерирован.`);
    }

    // Обрабатываем подуровни, если они существуют
    if (subItems && subItems.length > 0) {
      await generateDocumentation(subItems, finalDir);
    }
  }
}


// Убедитесь, что базовая директория 'docs' существует
const docsPath = path.join(__dirname, 'docs');
if (!fs.existsSync(docsPath)) {
  fs.mkdirSync(docsPath, { recursive: true });
  console.log(`Создана базовая директория: ${docsPath}`);
}


const SidebarMenu = generateSidebar(json)
fs.writeFileSync('./docs/sidebar-menu.json', JSON.stringify(SidebarMenu, null, ' '), 'utf-8');
console.log(`Записан JSON для сайдбара документации`)

// Запускаем генерацию документации
generateDocumentation(menu.items).then(() => {
  console.log('Процесс генерации завершен.');
}).catch((error) => {
  console.error('Произошла ошибка при генерации документации:', error);
});
