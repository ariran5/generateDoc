import { generateText } from "../../lib/openAIClient.mts";

export async function generateTest(prompt: string, model: string,){
  const result = await generateText(prompt, model)

  
}