import OpenAI from 'openai';
import minimist from 'minimist';
import prompts from "prompts";
import fs from 'node:fs';
import { generateText, } from './openAIClient.mjs';

const resPath = 'QUESTION.response.md';
const historyPath = 'QUESTION.history.json';

const {
  model,
  ctx,
  file,
} = minimist<{
  model?: OpenAI.Chat.ChatModel
  file: string
  ctx: boolean
}>(process.argv.slice(2), {
  default: {
    model: 'gpt-4o' as OpenAI.Chat.ChatModel,
    ctx: true
  },
  alias: {
    m: 'model',
    c: 'ctx',
    f: 'file',
  },
  string: ['_'],
})

if (!model) {
  throw new Error(`Invalid model: ${model} (-m your_model)`);
}

let history: { question: string, response: string }[] = [];

// Load history if exists
if (fs.existsSync(historyPath)) {
  const historyData = fs.readFileSync(historyPath, 'utf-8');
  history = JSON.parse(historyData);
}

let firstQuestion = file ? fs.readFileSync(file, 'utf-8'): null

do {
  // Only take the last 5 messages for context
  const recentHistory = history.slice(-5);
  const ctxText = recentHistory.map(h => `Q: ${h.question}\nA: ${h.response}`).join('\n') + '\n';

  let res =  firstQuestion ? (
    {
      value: firstQuestion
    }
  ): (
    await prompts({
      type: 'text',
      name: 'value',
      message: 'Что хотите спросить ?'
    })
  )
  firstQuestion = null
  
  if (!res.value.trim()) {
    throw new Error('Пустой ввод');
  }
  
  const prompt = `${ctxText}Q: ${res.value}`;
  
  const textRes = await generateText(prompt, model, ctxText);
  
  if (!textRes) {
    throw new Error('Invalid response');
  }
  
  // Save response to file and update history
  fs.writeFileSync(resPath, textRes);
  history.push({ question: res.value, response: textRes });
  
  // Retain only the last 5 entries in the history
  if (history.length > 5) {
    history = history.slice(-5);
  }

  fs.writeFileSync(historyPath, JSON.stringify(history, null, 2));
  
} while (true);

