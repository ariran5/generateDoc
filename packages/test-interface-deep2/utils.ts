

function extractText(text: string) {
  // Пробуем извлечь JSON из \`\`\`json ... \`\`\`
  {
    const jsonMatch = text.match(/```json([\s\S]*?)```/g);
    
    // если вариантов больше 1 то даже не пытаемся, там могут быть несколько разных JSON нам такое не подойдет
    if (jsonMatch && jsonMatch.length !== 1) {
      return null;
    }
  }

  const jsonMatch = text.match(/```json([\s\S]*?)```/);


  if (jsonMatch) {
    return jsonMatch[1].trim();
  }

 {
    // Если не нашли, ищем первый { и последний }
    const firstBracketIndex = text.indexOf('{');
    const lastBracketIndex = text.lastIndexOf('}');

    if (firstBracketIndex !== -1 && lastBracketIndex !== -1) {
      return text.slice(firstBracketIndex, lastBracketIndex + 1).trim();
    }
  }
  {
    // Если массив
    const firstBracketIndex = text.indexOf('[');
    const lastBracketIndex = text.lastIndexOf(']');

    if (firstBracketIndex !== -1 && lastBracketIndex !== -1) {
      return text.slice(firstBracketIndex, lastBracketIndex + 1).trim();
    }
  }

  return null;
};

export const extractJson = (text: string): string | null => {
  // Пробуем извлечь JSON из \`\`\`json ... \`\`\`
  const result = extractText(text)

  try {
    // if don't exept then valid json string
    JSON.parse(result);

    return result
  } catch (error) {

  }

  return null
};


export async function tryes<T extends () => any>(fn: T, count = 2): Promise<T extends () => infer R ? R : never> {
  do {
    try {
      return await fn()
    } catch (error) {
      if (count === 1) {
        console.error(error)
      }
      continue;
    }
  } while (--count);

  throw new Error('Not today')
}


// const s = await tryes(() => 1)