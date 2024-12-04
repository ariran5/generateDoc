import fs from 'node:fs'
import path from 'node:path'
import { glob } from 'glob'
import ig from 'ignore'

export function getIgnoredFiles() {
  return ig().add(fs.readFileSync('.gitignore').toString())
}
/**
 * Функция для получения всех файлов в указанной директории и поддиректориях
 */
export function readFilesRecursivelyAsPattern(dirPattern: string, ignore?: string[]): Promise<string[]> {
  return glob(
    path.join(
      dirPattern,
    ),
    { nodir: true, ignore, }
  );
}

export async function getProjectFiles() {
  const ignored = getIgnoredFiles()

  const files = await glob('**/*', {
    // Adds a / character to directory matches.
    mark: true,
    ignore: {
      ignored(path) {
        return !ignored.filter([path.relativePosix()]).length
      },
      childrenIgnored(path){
        const url = path.relativePosix()

        if (!url) {
          return false
        }
        return !ignored.filter([url]).length
      }
    },
    nodir: true,
  })

  return files
}