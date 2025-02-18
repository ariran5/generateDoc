#!/usr/bin/env tsx --env-file=.env

import { program } from 'commander';
import { RunProps } from './types';

program
  .name('neuro-tests')
  .description('AI-powered test generator')
  .version('0.1.0');

function collect(value, previous) {
  return previous.concat([value]);
}


program
  .command('generate <patterns...>')
  .description('Generate tests')
  .requiredOption('-l, --language <language>', 'Programming language')
  .requiredOption('-f, --framework <framework>', 'Testing framework')
  .requiredOption('-m, --model <model>', 'AI model')
  .option('--ref <string>', 'project files for reference files for best result', collect, [])
  .option('-o, --out-dir <dir>', 'Output directory', 'tests')
  // .option('--ignore-patterns', 'Ignore external dependencies', true)
  .action(async (patterns, options) => {

    const props: RunProps = {
      language: options.language,
      framework: options.framework,
      model: options.model,
      outDir: options.outDir,
      ignorePatterns: options.ignorePatterns,
      includePatterns: options.ref,
      baseDir: process.cwd()
    };

    // Инициализация и запуск генератора
    import('./index').then(module => module.run(patterns, props))
  });

program.parse(process.argv);