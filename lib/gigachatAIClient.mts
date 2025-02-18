import { GigaChat } from './gigachat/index.js';
import { updateUsage } from './usage.mjs';
import { encoding_for_model, Tiktoken, TiktokenModel } from "tiktoken";
import { ICompletionRequest } from 'gigachat-node/interfaces/completion.js';

// Инициализация клиента OpenAI с использованием API ключа из переменных окружения
export const client = new GigaChat(
  '13573c4b-129f-46d6-9dec-c4b6e129aa2c',
  '31ae7415-34c1-4836-b7ec-a805682c0436',
  true,
  true,
  true,
  false
);

const encoderTiktoken: {[key in ChatModel]?: Tiktoken} = {}

/**
 * Подсчет количества токенов в переданном тексте
 * @param text - Текст для подсчета токенов
 * @returns Количество токенов
 */
export function countTokens(text: string, model: ChatModel): number {
  const instance = encoderTiktoken[model] ? encoderTiktoken[model]: (encoderTiktoken[model] = encoding_for_model(model as unknown as TiktokenModel));
  const encoded = instance.encode(text);
  return encoded.length;
}

/**
 * Генерация текста с помощью модели OpenAI
 * @param prompt - Промпт для генерации ответа
 * @param model - Модель OpenAI для генерации текста
 * @param system - Дополнительный системный контекст
 * @returns Сгенерированный текст, либо null в случае ошибки
 */
export async function generateText(prompt: string, model: ChatModel, system?: string): Promise<string | null> {
  if (!prompt.trim().length) {
    throw new Error('Invalid prompt');
  }

  const messages: Messages = []

  if (system) {
    messages.push({
      role: model.includes('o1') ? 'assistant': 'system',
      content: system,
    })
  }

  messages.push({
    role: 'user',
    content: prompt
  })

  try {
    const response = await client.completion({
      messages,
      model,
    });
    
    const {
      completion_tokens,
      prompt_tokens,
      total_tokens,
    } = response.usage ?? {}

    if (response.usage) {
      updateUsage(response.usage, model!)
    }

    console.log(`Промпт общей длиной ${prompt.length}, исходящих/входящих токенов ${prompt_tokens}/${completion_tokens}(${total_tokens})`)
    return response.choices[0].message.content;
  } catch (error) {
    console.error('Ошибка при генерации текста:', error);
    return null;
  }
}

export type Messages = ICompletionRequest['messages']
export type ChatModel = ICompletionRequest['model']

/**
 * Генерация текста с использованием размещенных сообщений
 * @param messages - Сообщения для обработки моделью
 * @param model - Модель OpenAI для генерации текста
 * @returns Сгенерированный текст, либо null в случае ошибки
 */
export async function generateTextAsMessages(
  messages: Messages,
  model: ChatModel,
): Promise<string | null> {
  try {
    const response = await client.completion({
      messages,
      model,
    });

    const {
      completion_tokens,
      prompt_tokens,
      total_tokens,
    } = response.usage ?? {}

    if (response.usage) {
      updateUsage(response.usage, model!)
    }
    const allPrompts = messages.reduce((acc, message) => acc + message.content, '')

    console.log(`Промпт общей длиной ${allPrompts.length}, исходящих/входящих токенов ${prompt_tokens}/${completion_tokens}(${total_tokens})`)
    
    return response.choices[0].message.content;
  } catch (error) {
    console.error('Ошибка при генерации текста:', error);
    return null;
  }
}
