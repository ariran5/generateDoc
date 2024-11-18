export const template = (text: string): string => `

<!--shortContext
${text}
-->`

export const extractShortContext = (text: string): RegExpMatchArray | null => {
  return text.match(/<!--shortContext\s([\s\S]*?)-->/)  
}