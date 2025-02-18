import OpenAI from 'openai';
import { updateUsage } from './usage.mjs';

// Инициализация клиента OpenAI с использованием API ключа из переменных окружения
export const client = new OpenAI({
  baseURL: process.env['OPENAI_HOST'],
  apiKey: process.env['OPENAI_API_KEY'], // This is the default and can be omitted
});


/**
 * Генерация текста с использованием размещенных сообщений
 * @param messages - Сообщения для обработки моделью
 * @param model - Модель OpenAI для генерации текста
 * @returns Сгенерированный текст, либо null в случае ошибки
 */
export async function createCompletention(
  options: Pick<OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming, 'messages' | 'model' | 'temperature' | 'response_format'>
) {
  const {
    model, messages,
  } = options
  const response = await client.chat.completions.create(options);

  if (response.usage) {
    updateUsage(response.usage, model!)
  }
  const allPrompts = messages.reduce((acc, message) => acc + message.content, '')

  return response;
}

