import OpenAI from 'openai';
import { updateUsage } from './usage.mjs';
import { encoding_for_model, Tiktoken, TiktokenModel } from "tiktoken";


export const client = new OpenAI({
  apiKey: process.env['OPENAI_API_KEY'], // This is the default and can be omitted
});

let encoderTiktoken: Tiktoken
export function countTokens(text: string): number {
  const encoded = encoderTiktoken.encode(text);
  return encoded.length;
}

// Генерация текста с помощью OpenAI
export async function generateText(prompt: string, model: OpenAI.Chat.ChatModel, ctx?: string): Promise<string | null> {
  if (!prompt.trim().length) {
    throw new Error('Invalid prompt');
  }
  if (!encoderTiktoken) {
    encoderTiktoken = encoding_for_model(model as unknown as TiktokenModel)
  }
  console.log(`Начат запрос. Размер контекста ${prompt.length + (ctx?.length ?? 0)} символов и ${countTokens(prompt + (ctx ?? ''))} токенов`)

  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = []

  if (ctx) {
    messages.push({
      role: 'assistant', content: ctx
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