import fs from 'node:fs';
import path from 'node:path'

const USAGE_FILE = 'neuro-docs'.toUpperCase() + '.OPENAI_USAGE.json';
const defaultUsageObj = {
  openAI: {
    completion_tokens: 0,
    prompt_tokens: 0,
    total_tokens: 0,
  }
}

const __dirname = process.cwd();

const filePath = path.join(__dirname, USAGE_FILE);

const usage = fs.existsSync(filePath) ? JSON.parse(fs.readFileSync(filePath, 'utf8').toString()) as typeof defaultUsageObj : structuredClone(defaultUsageObj); 

updateUsage(defaultUsageObj.openAI)

export function updateUsage(obj: typeof defaultUsageObj['openAI']) {
  usage.openAI.completion_tokens += obj.completion_tokens
  usage.openAI.prompt_tokens += obj.prompt_tokens
  usage.openAI.total_tokens += obj.total_tokens

  fs.writeFileSync(USAGE_FILE, JSON.stringify(usage, null, ' '), 'utf-8')
}

export function resetUsage(){
  Object.assign(usage, structuredClone(defaultUsageObj))
  
  fs.writeFileSync(USAGE_FILE, JSON.stringify(usage, null, ' '), 'utf-8')
}