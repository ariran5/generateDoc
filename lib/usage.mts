import fs from 'node:fs';
import path from 'node:path'

type OpenAIModel = string
interface Usage {
  openAI: {
    [key: OpenAIModel]: {
      completion_tokens: number
      prompt_tokens: number
      total_tokens: number
    }
  }
}

const USAGE_FILE = 'neuro-docs'.toUpperCase() + '.OPENAI_USAGE.json';
const defaultObj: Usage = {
  openAI: {}
}
const defaultUsageObj = () => ({
  completion_tokens: 0,
  prompt_tokens: 0,
  total_tokens: 0,
})

const __dirname = process.cwd();

const filePath = path.join(__dirname, USAGE_FILE);

const usage = fs.existsSync(filePath) ? JSON.parse(fs.readFileSync(filePath, 'utf8').toString()) as Usage : structuredClone(defaultObj); 

const usageOnStart = Object.freeze(structuredClone(usage))

export function getSessionUsage(model: string): Usage['openAI'][string] {
  const startUsage = Object.assign({
    openAI: {
      [model]: defaultUsageObj(),
      ...usageOnStart['openAI']
    },
  })

  return {
    completion_tokens: usage.openAI[model].completion_tokens - startUsage.openAI[model].completion_tokens,
    prompt_tokens: usage.openAI[model].prompt_tokens - startUsage.openAI[model].prompt_tokens,
    total_tokens: usage.openAI[model].total_tokens - startUsage.openAI[model].total_tokens,
  }
}

export function updateUsage(obj: Usage['openAI'][string], model: OpenAIModel) {
  if (!usage.openAI[model]) {
    usage.openAI[model] = defaultUsageObj();
  }
  usage.openAI[model].completion_tokens += obj.completion_tokens
  usage.openAI[model].prompt_tokens += obj.prompt_tokens
  usage.openAI[model].total_tokens += obj.total_tokens

  fs.writeFileSync(USAGE_FILE, JSON.stringify(usage, null, ' '), 'utf-8')
}

export function resetUsage(){
  Object.assign(usage, structuredClone(defaultObj))
  
  fs.writeFileSync(USAGE_FILE, JSON.stringify(usage, null, ' '), 'utf-8')
}