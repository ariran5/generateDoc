
import { promises as fs } from 'fs';
import { zodFunction, zodResponseFormat, } from 'openai/helpers/zod'
import * as path from 'path';
import { addFileToContext, removeFileFromContext } from '../../utils/context';
import { ChatModel, countTokens, generateText, generateTextAsMessages, Messages } from '../../lib/openAIClient.mts';
import { filesAsSmallDescription, systemCommandsMessage, systemLanguageMessage } from './systemMessages';
// import inquirer from 'inquirer';
import inquirer from 'prompts';
import pc from 'picocolors'
import { setTimeout } from 'timers/promises';
import { z } from 'zod';
import { getProjectFiles } from '../../utils/dir';
import { exec } from 'child_process';

// options
const canMutate = true
// const accumulateContext = true

export interface FileCommand {
  type: 'command'
  // read - прочитать файл для того чтоб потом применить какую-нибудь команду для которой нужно знать содержимое этого файла
  // create/update - создать и изменить файл, команда не умеет создавать директорию. Создавая файл в какой-то папке директория создастся автоматически
  // delete - удалить файл
  // read_dir - прочитать директорию, узнать какие в ней есть файлы и папки
  action: 'create' | 'read' | 'update' | 'delete' | 'read_dir';
  filePath: string;
  // В поле prompt тебе нужно указать сообщение для ии, который выполнит эту работу, не нужно делать эту работу самостоятельно
  // каждая команда может работать только с 1 файлом. Этот ИИ будет знать то же самое что и ты, так что если ссылаешься на какой-то файл не забудь сначала его прочесть в полном виде если это необходимо
  prompt?: string; // (только для create, update)
}

export interface MetaCommand {
  type: 'meta-command'
  // terminate - это команда прерывает выполнение всех команд
  // next - это команда, которая говорит о том, что после выполнения имеющихся команд можно подумать, нужны ли еще дополнительные команды после выполнения имеющихся
  action: 'terminate' | 'next';
}

export interface BashCommand {
  // 'bash' - команда, которая вызовет в консоли тот текст, который написан в поле command
  type: 'bash'
  action: 'execute'
  // текст команды
  command: string;
}

export interface InfoCommand {
  type: 'info-command'
  // 'need-info' Команда, которая поможет получить дополнительный контекст от пользователя для выполнения следующей задачи, если это необходимо
  action: 'need-info';
  prompt: string;
}

// команда, которая говорит, что определенное действие можно разбить на множество более мелких команд
export interface SplitCommand {
  type: 'split-command'
  // 'split_into_small_tasks' это команда, которая говорит о том, что задание слишком сложное и нужно разделить задачу на более мелкие команды
  action: 'split_into_small_tasks';
  filePath: string;
  prompt: string;
}

export type Command = MetaCommand | FileCommand | InfoCommand | SplitCommand | BashCommand;

export async function executeCommands(
  commands: Command[],
  model: string,
  chatHistory: Messages,
  options: {base: string, getFiles: typeof getProjectFiles}
) {
  const {base = './', getFiles } = options;

  for (const command of commands) {
    await setTimeout(400)

    // const tokenLength = countTokens(
    //   chatHistory.reduce((a, i) => a + i.content, ''),
    //   model
    // )

    // if (chatHistory.length > 40 && tokenLength > 45_000) {
    //   console.log('Оптимизируем контекст, он слишком большой')
    //   const oldHistory = chatHistory.splice(0, 10)
    //   const res = await generateTextAsMessages([
    //     {
    //       role: 'system',
    //       content: `
    //       Вот есть история переписки. Дай краткий пересказ о том, что написано в этих сообщениях в хронологическом порядке.
    //       ${JSON.stringify(oldHistory)}
    //       `
    //     }
    //   ], model)

    //   if (res) {
    //     chatHistory.unshift({
    //       role: 'system',
    //       content: `
    //       Вот то, о чем шло общение раньше. История сжата в это небольшое сообщение:
    //       ${res}
    //       `
    //     })
    //   }
    // }

    try {
      switch (command.action) {
        case 'need-info': {
          const { userResponse } = await inquirer.prompt([
            {
              type: 'text',
              name: 'userResponse',
              message: command.prompt,
            }
          ]);

          const m: Messages = [
            {
              role: 'assistant',
              content: command.prompt
            },
            {
              role: 'user',
              content: userResponse
            }
          ];

          chatHistory.push(...m)

          const newCommands = await generateCommands([
              ...chatHistory,
              {
                role: 'system',
                content: `
                  files in froject: ${(await getFiles({base,})).join()}
                `
              },
              {
                role: 'system',
                content: systemLanguageMessage(),
              },
            ]
            , model, {base})
          
          chatHistory.push(
            {
              role: 'assistant',
              content: JSON.stringify(newCommands)
            }
          );
          
          await executeCommands(newCommands, model, m, options)
          break
        }
        case 'split_into_small_tasks': {

          const m: Messages = [
            {
              role: 'system',
              content: `Давай эту задачу разобьем на конкретные команды работы над файлами`
            },
            {
              role: 'user',
              content: command.prompt
            }
          ];

          chatHistory.push(...m)

          const newCommands = await generateCommands([
            ...chatHistory,
            {
              role: 'system',
              content: `
                files in froject: ${(await getFiles({base,})).join()}
              `
            },
            {
              role: 'system',
              content: systemLanguageMessage(),
            },
          ], model,{base})

          chatHistory.push(
            {
              role: 'assistant',
              content: JSON.stringify(newCommands)
            }
          );

          await executeCommands(newCommands, model, m, options)
          break;
        }
        case 'next': {

          const m: Messages = [
            {
              role: 'system',
              content: `Все команды были выполнены, какие команды будем делать дальше ?`
            }
          ];

          chatHistory.push(...m)

          const newCommands = await generateCommands([
            ...chatHistory,
            {
              role: 'system',
              content: `
                files in froject: ${(await getFiles({base,})).join()}
              `
            }
          ], model, {base})

          chatHistory.push(
            {
              role: 'system',
              content: 'была выполнена команда next и получены новые команды'
            },
            {
              role: 'assistant',
              content: JSON.stringify(newCommands)
            }
          );

          await executeCommands(newCommands, model, m, options)
          break;
        }

        case 'create':
        case 'update': {
          const filePath = path.resolve(path.join(base, command.filePath));

          if (!command.prompt) {
            return
          }
          if (canMutate) {
            await fs.mkdir(path.dirname(filePath), { recursive: true });
            
            const res = await generateTextAsMessages([
              {
                role: 'system',
                content: systemLanguageMessage(),
              },
              ...chatHistory,
              {
                role: 'system',
                content: `
                  files in froject: ${(await getFiles({base,})).join()}
                `
              },
              {
                role: 'system',
                content: `
                Мы генерируем новые файлы для проекта по заданию пользователя. Учитывай то, какие файлы уже есть и делай соответствующую работу.
                Ты сейчас будешь работать с файлом ${command.filePath}.


                ответь в формате:
                ${
                  JSON.stringify(
                    z.object({
                      code: z.string().describe("Код, который нужен пользователю в его файле, с комментариями в коде"),
                      description: z.string().describe("Описание кода, которое мы покажем пользователю"),
                    }),
                    null,
                    '  '
                  )
                }
                `,
              },
              {
                role: 'user',
                content: command.prompt,
              }
            ],
            model,
            zodResponseFormat(
              z.object({
                
                code: z.string().describe("Код, который нужен пользователю в его файле, с комментариями в коде"),
                description: z.string().describe("Описание кода, которое мы покажем пользователю"),
              }),
              'response_with_code'
            )
          )
  
            if (!res) {
              return
            }
            console.log(res);
            const {code, description} = JSON.parse(res)
  
            await fs.writeFile(filePath, code, 'utf-8');
            // await addFileToContext(filePath, model, generateText)
            chatHistory.push(
              {
                role: 'system',
                content: `
                  Была выполнена команда ${JSON.stringify(command)}
                `
              }
            )
          }
          console.log(`File ${command.action}: ${command.filePath}`);
          break;
        }

        case 'read': {
          const filePath = path.resolve(path.join(base, command.filePath));

          const content = await fs.readFile(filePath, 'utf-8');

          chatHistory.push({
            role: 'system',
            content: `
              Необходимо было прочесть файл ${command.filePath} с помощью команды read, команда выполнена и вот его содержание:
              ${content}
            `
          });

          break;
        }
          
          

        case 'delete': {
          const filePath = path.resolve(path.join(base, command.filePath));
          
          if (canMutate) {
            await fs.unlink(filePath);
          }
          // await removeFileFromContext(filePath)
          console.log(`File deleted: ${command.filePath}`);
          break;
        }

        case 'terminate': {
          
          return
        }

        case 'read_dir': {
          const filePath = path.resolve(path.join(base, command.filePath));

          const content = await fs.readdir(filePath, 'utf-8');

          chatHistory.push({
            role: 'system',
            content: `
              Необходимо было прочесть директорию ${command.filePath} с помощью команды read_dir, команда выполнена и вот его содержание:
              ${content.join(',')}
            `
          });

          break;
        }

        case 'execute': {
          exec(command.command)

          chatHistory.push({
            role: 'system',
            content: `
              Необходимо было вызвать команду в bash, вот текст команды "${command.command}". Задача была выполнена.
            `
          });
          break;
        }

        default:
          // @ts-ignore
          console.log(`Unknown action: ${command.action}`);
      }
    } catch (error) {
      console.error(`Error processing ${command.action}:`, error);
    }
  }
}

async function generateCommands(
  messages: Messages,
  model: string,
  options: {base: string}
) {
  const {base} = options
  const systemMessages: Messages = [
    {
      role: 'system',
      content: systemCommandsMessage,
    },
  ]

  const allMessages: Messages = [
    ...messages,
    ...systemMessages,
  ]

  const res = await generateTextAsMessages(
    allMessages,
    model,
  );

  console.log(res)

  const {
    confirm,
  } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'confirm',
      message: 'Вы согласны с этими командами ?',
      default: true
    }
  ])

  if (!confirm) {
    // попробовать еще раз
    console.error('Согласен, плохие команды')
    return []
  }

  if (!res) {
    throw new Error('No response')
  }


  let commands: Command[]
  try {
    commands = JSON.parse(res) as Command[]
  } catch (error) {
    const m: Messages = [
      ...messages,
      {
        role: 'assistant',
        content: res,
      },
      {
        role: 'user',
        content: `
        я не смог распарсить этот json, пожалуйста, отформатируй эту строку и отдай мне чистый JSON без markdown и без любой другой разметки
        если не получилось найти json то ответь мне просто с помощью таких фигурных скобок внутри квадратных, например: [{}]

        Не забывай, что это должен быть массив из команд
        `
      }
    ]

    const refactoredJSON = await generateTextAsMessages(m, model)

    if (!refactoredJSON) {
      throw new Error('No JSON')
    }

    commands = JSON.parse(
      refactoredJSON
    ) as Command[]
  }

  return commands
}