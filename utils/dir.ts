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

interface Props {
  base: string;
}

export async function getProjectFiles(options: Props) {
  const ignored = getIgnoredFiles()
  const pattern = path.join(options.base || './', '**/*')
  const files = await glob(pattern, {
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