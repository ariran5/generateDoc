import { createOptimizedContext, read, write } from "../../utils/context";
import {  getProjectFiles } from "../../utils/dir";
import { executeCommands, InfoCommand } from "./commands";
import { ChatModel, generateText, Messages } from "../../lib/openAIClient.mts";
import { program } from "commander";
import { getUniqueElementsReport } from "../../utils/arrays"

program
  .name('neuro-app')
  .description('Generation app and change it')
  // .version(pkg.version)


function collect(value, previous) {
  return previous.concat([value]);
}

program
  .command('gen')
  .description('Генерация тестов для выбранных файлов в другую директорию')
  .argument('<string>', 'ignore path pattern, example: **/*.{rb,ts}')
  // .requiredOption('-l, --language <string>', 'programming language')
  // .requiredOption('-f, --framework <string>', 'testing framework')
  // .requiredOption('-i, --ignore <string>', 'ignore path pattern or array of patterns', collect, [])
  // .option('--gitignore', 'true/false use gitignore rules, default true', v => v == undefined ? true: Boolean(v), true)
  // .option('--ref <string>', 'project files for reference files for best result', collect, [])
  // .option('-r, --replace', 'replace exists tests', v => v == undefined ? true: Boolean(v), false)
  // .option('-o, --out <string>', 'out dir for files, default "tests"', v => v, 'tests')
  .requiredOption('-m, --model <string>', 'Model name',)
  // .option('--optimized', 'use mini files context', v => v == undefined ? true: Boolean(v), false)
  // .option('--rechecking', 'rechecking result with additional request on each file for find errors', v => v == undefined ? true: Boolean(v), false)
  .action((str: string, options) => {
    console.debug(options);
    
    main(options.model)
  });


main('deepseek/deepseek-chat').catch(console.error)


async function main(model: string) {
  console.log(model)
  const base = './'

  const files = await getProjectFiles({base,})

  // console.log(files.length)
  
  // const confirm = true
  // const { confirm } = await inquirer.prompt([
  //   {
  //     type: 'confirm',
  //     name: 'confirm',
  //     message: 'create new optimized context ?',
  //     default: false
  //   }
  // ]);

  // console.log(files)
  // return 
  // if (confirm) {
  //   const ctx = read()
  //   const diff = getUniqueElementsReport(Object.keys(ctx), files)
  //   const newCTX = await createOptimizedContext(diff.onlyInArray2, model, generateText)

  //   diff.onlyInArray1.forEach((path) => {
  //     delete ctx[path]
  //   })
    
  //   write(
  //     Object.assign(ctx, newCTX)
  //   )
  // }

  const chatHistory: Messages = []

  runWork(model, chatHistory, {base, getFiles: getProjectFiles})
}

async function runWork(
  model: string,
  chatHistory: Messages,
  options: {base: string, getFiles: typeof getProjectFiles}
): Promise<void> {
  let continueExecution = true;

  while (continueExecution) {
    const startCommand: InfoCommand = {
      type: 'info-command',
      action: 'need-info',
      prompt: 'Что будем делать ?',
    }

    await executeCommands([startCommand], model, chatHistory, {
      ...options,
    });
  }
}

