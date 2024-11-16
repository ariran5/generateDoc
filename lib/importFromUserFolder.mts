import path from 'path';
import { pathToFileURL } from 'url';

export async function importUserFile(filePath: string) {
  const absolutePath = path.resolve(process.cwd(), filePath);
  try {
    const module = await import(pathToFileURL(absolutePath).href);
    return module;
  } catch (error) {
    console.error('Не удалось импортировать файл:', error);
    return null;
  }
}
