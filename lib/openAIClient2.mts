import OpenAI from 'openai';
import { updateUsage } from './usage.mjs';

// Инициализация клиента OpenAI с использованием API ключа из переменных окружения
export const client = new OpenAI({
  baseURL: process.env['OPENAI_HOST'],
  apiKey: process.env['OPENAI_API_KEY'], // This is the default and can be omitted
});

export async function createCompletention(
  options: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming,
) {
  const {
    model,
  } = options
  const response = await client.chat.completions.create(options);

  if (response.usage) {
    updateUsage(response.usage, model!)
  }

  return response;
}

