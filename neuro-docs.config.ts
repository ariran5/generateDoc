import { HistoryItem, SidebarItem } from './lib/index.mjs'
import { MenuItem, ThemeMenuItem } from './lib/json.mjs'

export { json as menu } from './test-json.mjs'

const divider = '---%%%---%%%---'

export const question = (
  item: ThemeMenuItem,
  menupath: MenuItem[],
  history: HistoryItem[],
  sidebar: {
    sidebar: Record<string, SidebarItem[]>,
    sidebarWithFilenames: Record<string, SidebarItem[]>
  }
) => `
Мы с тобой пишем документацию для проекта, который помогает людям строить частные дома самостоятельно или с помощью бригад/подрядчиков 
нужно дать им полную информацию для самостоятельного ознакомления, не только чтоб строить но и при необходимости контролировать кажое дейтвие подрядчиков, 
как работу так и закупки.
Еще наш проект дает людям не только строительный справочник, а еще и дает полностью всю проектную документацию к домам из каталога домов беслпатно, 
но не в чистом виде, а в виде инструкции к постройке по проектной документации. Мы даем инструкцию, в которой вырезки из полной проектной документации к постройке от и до.
Вот тебе структура моего проекта, то какие есть категории и темы, и ссылки на файлы маркдаун. 

${JSON.stringify(sidebar.sidebarWithFilenames, null, ' ')}

Ты пишешь по очереди сверху вниз каждую эту тему, и те темы, которые ты описал будут сверху и будут разделяться с помощью "${divider}".
Удали этот разделитель в финальной генерации.

Тебе нужно раскрыть тему, которая описана в самом низу.
Не забывай делать относительные ссылки между файлами чтоб не повторяться, но делай их с умом в контенте, если это действительно нужно.
И делай ссылки только на будующий контент, на тот который был ранее - делать перелинковку не нужно.
Также просто перелинковка в виде меню мне не нужна, так как у меня уже есть меню, но если на странице будет очень много контента то можно в верхней части сделать блок "содержание".

Не забывай, что мы рассказываем в контексте России, поэтому, если имеет смысл, то можно приводить примеры для разных климатических зон России, и с Российскими нормативами.

Вот контент который у меня уже есть
${
  history.map(item => `
Тема: ${item.item.title}
Путь до файла: ${item.filePath}
Контент: ${item.text}

${divider}

`)
}

Теперь необходимо сгенерировать контент для темы: ${item.title},
и вот к ней комментарий:
${menupath.length ? menupath.map(item => item.baseContent).join('\n'): ''}
${item.content}
`
