import { Menu, MenuItem, } from "./json.mjs";
import path from 'path';

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

interface GenerateSidebarOptions {
  withExtension: boolean
  withIndexFile: boolean
  extension: string
}

const defaultObject: GenerateSidebarOptions = {
  withExtension: false,
  withIndexFile: false,
  extension: '.md'
}

function addLastSymbolIfMissing(str: string, symbol: string) {
  if (!str.endsWith(symbol)) {
    return str + symbol;
  }
  return str;
}


export function generateSidebar(menu: Menu[], {withExtension, withIndexFile, extension} = defaultObject): Record<string, SidebarItem[]> {
  const traverse = (items: MenuItem[], baseDir = ''): SidebarItem[] => {
    return items.map(item => {
      const { dir, filename,} = item
      const pathWithDir = dir ? path.posix.join(baseDir, dir) : baseDir
      const pathWithFilename = filename ? path.posix.join(pathWithDir, filename) : baseDir

      let finalPathWithFilename = pathWithFilename
      if (!withIndexFile) {
        finalPathWithFilename = finalPathWithFilename.replace('index' + extension, '')
      }
      if (!withExtension) {
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