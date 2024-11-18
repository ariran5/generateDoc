export type MenuItem = CategoryMenuItem | ThemeMenuItem;

export type CategoryMenuItem = {
  title: string;
  baseContent?: string;
  dir?: string; // Поле для указания директории
  items: MenuItem[];
} & _Shared

export type ThemeMenuItem = {
  title: string;
  content: string; // комментарий к категории для генерации ChatGPT
  baseContent?: string; // контекст генерации, который прибавляется к каждому контексту ребенка
  dir?: string; // Поле для указания директории
  filename: string; // Новое поле для указания имени файла
  items?: MenuItem[];
} & _Shared

type _Shared = {
  dontUsePreviousFilesAsContext?: boolean; // Использовать ли прошлые файлы как контекст
  dontAddToContext?: boolean; // Добавлять ли эту категорию в контекст
  /**
   * если строит true, то мы получаем у chatGPT сокращенную версию для использования в контексте для следующих сообщений. 
   * нужно только если используется большой контекст, в противном случае скушает лишние деньги
   */
  optimizedContext?: boolean;
}

export interface Menu {
  title: string; // о чем эта документация
  items: MenuItem[]; 
  base: string; // base url
}
