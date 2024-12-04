// import { readFilesRecursivelyAsPattern } from "../../utils/dir";
import { program } from "commander";
import { run, RunProps } from "./generate";
// import pkg from '../../package.json'

program
  .name('neuro-tests')
  .description('Generation tests for project')
  // .version(pkg.version)


function collect(value, previous) {
  return previous.concat([value]);
}

program
  .command('generate')
  .description('Генерация тестов для выбранных файлов в другую директорию')
  .argument('<string>', 'ignore path pattern, example: **/*.{rb,ts}')
  .requiredOption('-l, --language <string>', 'programming language')
  .requiredOption('-f, --framework <string>', 'testing framework')
  .requiredOption('-i, --ignore <string>', 'ignore path pattern or array of patterns', collect, [])
  .option('--gitignore', 'true/false use gitignore rules, default true', v => v == undefined ? true: Boolean(v), true)
  .option('--ref <string>', 'project files for reference files for best result', collect, [])
  .option('-r, --replace', 'replace exists tests', v => v == undefined ? true: Boolean(v), false)
  .option('-o, --out <string>', 'out dir for files, default "tests"', v => v, 'tests')
  .option('-m, --model <string>', 'chatGPT model name, default gpt-4o-mini', v => v, 'gpt-4o-mini')
  .option('--optimized', 'use mini files context', v => v == undefined ? true: Boolean(v), false)
  .option('--rechecking', 'rechecking result with additional request on each file for find errors', v => v == undefined ? true: Boolean(v), false)
  .action((str: string, options: RunProps) => {
    console.debug(options);
    
    run(str, options)
  });

  

// program.command('split')
//   .description('Split a string into substrings and display as an array')
//   .argument('<string>', 'string to split')
//   .option('-i, --ignore', 'display just the first substring')
//   .option('-s, --separator <char>', 'separator character', ',')
  

program.parse();