import { CodeAnalyzer } from './analyzer';
import { TestGenerator } from './test-generator';
import { ContextManager } from './context';
import { FileContext, RunProps } from './types';
import fs from 'fs';
import path from 'path';
import picocolors from 'picocolors';
import { getSessionUsage } from '../../lib/usage.mts';
import { SingleBar, Presets } from 'cli-progress'
import { setTimeout } from 'timers/promises';

// index.ts
export async function run(patterns: string[], props: RunProps) {
  // Для того чтоб вывелись все системные сообщения библиотек
  await setTimeout(100);
  debugger

  const contextManager = new ContextManager(props.baseDir);
  const analyzer = new CodeAnalyzer(contextManager, props);
  const testGenerator = new TestGenerator(props);
  const bar = new SingleBar({}, Presets.shades_classic)


  const files = patterns.reduce<string[]>((acc, pattern) => {
    const files = CodeAnalyzer.getProjectFiles(pattern)

    return acc.concat(files)
  }, [])

  if (!files.length) {
    console.log(picocolors.yellow('No files for this paths'))
    return
  }

  const tasks = files.length * 5 + 4

  console.log(
    picocolors.gray('\n================================================\n'))
  
  console.log(picocolors.bold(
    `Hello, now we generate tests ${picocolors.blue(`for ${files.length} files`)}`
  ))
  console.log(`Allowed for context - ${picocolors.green(`${analyzer.projectFiles.length} files`)}`)
  console.log(picocolors.gray(`Tasks - ${tasks}`))

  console.log(
    picocolors.gray('\n================================================\n\n'))

  bar.start(tasks, 0)

  await testGenerator.initPerfectTest();

  bar.update(4);
  
  let generatedTests = 0;

  for (const file of files) {
    // @ts-ignore
    const progressOnStart = bar.value;

    try {
      
      // const [base, ...other] = await analyzer.resolveContext(file);
      const generator = await analyzer.resolveContext2(file);

      let analizeResult: FileContext[]
      let analizeStep = 0;

      while (true) {
        const {
          done,
          value
        } = await generator.next();

        if (done) {
          analizeResult = value
          break
        } else {
          analizeStep = value
          bar.update(progressOnStart + value)
        }
      }

      const [base, ...other] = analizeResult

      const testsGenerator = await testGenerator.generateTestSuite2(
        [base, ...other]
      );


      let testsResult: {code: string, description: string}
      let testsStep = 0;
      
      while (true) {
        const {
          done,
          value
        } = await testsGenerator.next();

        if (done) {
          testsResult = value
          break
        } else {
          testsStep = value
          bar.update(progressOnStart + analizeStep + value)
        }
      }
      
      const tests = testsResult


      if (!tests) {
        console.log('Can\'t create tests for ' + file)
        continue;
      }

      const {
        code,
        description,
      } = tests;

      if (!code) {
        throw new Error(`I cant extract code from response for ${file}. Try again`)
      }
      
      // Сохранение результатов
      const outPath = path.join(
        props.outDir,
        path.relative(props.baseDir, file)
      ).replace(/(\.[^/.]+)+$/, `.test$&`);
      
      fs.mkdirSync(path.dirname(outPath), { recursive: true });
      fs.writeFileSync(outPath, `
/**
 ${description ?? ''}
*/
${code}
        `);
      
      generatedTests++;
    } catch (error) {
      console.error(`\nError processing ${file}:\n`, error);
    }
    bar.update(progressOnStart + 5);
  }

  console.log(picocolors.green(`\n\n\n✅ Done ${generatedTests}/${files.length}`))
  console.log(picocolors.cyan(
    `\n📈 Used tokens: \n${JSON.stringify(getSessionUsage(props.model), null, '  ')}`)
  )
  process.exit(0);
}
