import { createCompletention as gigachatCreateCompletention} from '../../lib/gigachatAIClient2.mjs'
import { createCompletention as openAIcreateCompletention } from '../../lib/openAIClient2.mjs'




export function createCompletention(
  ...args: Parameters<typeof openAIcreateCompletention>
): ReturnType<typeof openAIcreateCompletention> {
  const {
    model,
  } = args[0]

  if (model.toLowerCase().includes('gigachat')) {
    // @ts-ignore
    return gigachatCreateCompletention(...args)
  }

  return openAIcreateCompletention(...args)
}