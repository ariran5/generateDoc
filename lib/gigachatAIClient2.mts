import { GigaChat } from './gigachat/index.js';
import { updateUsage } from './usage.mjs';
import { ICompletionRequest } from 'gigachat-node/interfaces/completion.js';
import { setTimeout } from 'timers/promises';
import pLimit from 'p-limit'

// ENV variables
// GIGACHAT_CLIENT_ID
// GIGACHAT_CLIENT_SECRET
const {
  GIGACHAT_CLIENT_SECRET,
  GIGACHAT_CLIENT_ID,
} = process.env

// Инициализация клиента OpenAI с использованием API ключа из переменных окружения
export const client = new GigaChat(
  GIGACHAT_CLIENT_SECRET,
  GIGACHAT_CLIENT_ID,
  true,
  true,
  true,
  false
);

// Gigachat API rate limit concurency
const limit = pLimit(1)

/**
 * Генерация текста с использованием размещенных сообщений
 * @param messages - Сообщения для обработки моделью
 * @param model - Модель OpenAI для генерации текста
 * @returns Сгенерированный текст, либо null в случае ошибки
 */
export async function createCompletention(
  options: Pick<ICompletionRequest, 'messages' | 'temperature' | 'model' > & {response_format?: any}
) {
  return limit(async () => {
    // Rate limit API 🥲
    await setTimeout(1000);
    
    // @ts-ignore
    delete options['response_format'];
    
    const {model, messages, } = options
    
    const response = await client.completion({
      ...options,
      max_tokens: 2048 * 8,
    });
  
  
    if (response.usage) {
      updateUsage(response.usage, model!)
    }
    
    return response;
  })
}
