import OpenAI from 'openai';
import { updateUsage } from './usage.mjs';
import { encoding_for_model, Tiktoken, TiktokenModel } from "tiktoken";
import { ChatCompletionCreateParamsBase } from 'openai/src/resources/chat/completions.js';
import { ReadStream } from 'fs';

// Инициализация клиента OpenAI с использованием API ключа из переменных окружения
export const client = new OpenAI({
  baseURL: process.env['OPENAI_HOST'],
  apiKey: process.env['OPENAI_API_KEY'], // This is the default and can be omitted
});

const model = process.env['OPENAI_MODEL'] as string;

if (!model) {
  console.log('Need model in env OPENAI_MODEL=');
  
}

const encoderTiktoken: {[key in ChatModel]?: Tiktoken} = {}

/**
 * Подсчет количества токенов в переданном тексте
 * @param text - Текст для подсчета токенов
 * @returns Количество токенов
 */
export function countTokens(text: string,): number {
  // const instance = encoderTiktoken[model] ? encoderTiktoken[model]: (encoderTiktoken[model] = encoding_for_model(model as unknown as TiktokenModel));
  // const encoded = instance.encode(text);
  // return encoded.length;
  return 0;
}

/**
 * Генерация текста с помощью модели OpenAI
 * @param prompt - Промпт для генерации ответа
 * @param model - Модель OpenAI для генерации текста
 * @param system - Дополнительный системный контекст
 * @returns Сгенерированный текст, либо null в случае ошибки
 */
export async function generateText(prompt: string, model: OpenAI.Chat.ChatModel, system?: string): Promise<string | null> {
  if (!prompt.trim().length) {
    throw new Error('Invalid prompt');
  }

  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = []

  if (system) {
    messages.push({
      role: 'system',
      content: system,
    })
  }

  messages.push({
    role: 'user',
    content: prompt
  })

  try {
    const response = await client.chat.completions.create({
      messages,
      model: model,
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

export type Messages = OpenAI.Chat.Completions.ChatCompletionMessageParam[]
export type ChatModel = OpenAI.Chat.ChatModel

/**
 * Генерация текста с использованием размещенных сообщений
 * @param messages - Сообщения для обработки моделью
 * @param model - Модель OpenAI для генерации текста
 * @returns Сгенерированный текст, либо null в случае ошибки
 */
export async function generateTextAsMessages(
  messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
  model: string,
  response_format?: ChatCompletionCreateParamsBase['response_format']
): Promise<string | null> {
  try {
    const response = await client.chat.completions.create({
      messages,
      model: model,
      response_format,
      temperature: 0.2,
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


export async function transcribeFile(fileStream: ReadStream): Promise<string | null> {
  try {
    const response = await client.audio.transcriptions.create({
      language: 'ru',
      file: fileStream,
      model: 'whisper-1',
    });

    console.log(Object.keys(response))

    return response.text;
  } catch (error) {
    console.error(`Ошибка при транскрибации файла`, error);
    return null;
  }
}
