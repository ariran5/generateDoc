
import { promises as fs } from 'fs';
import * as path from 'path';
import { addFileToContext, removeFileFromContext } from '../../utils/context';
import { ChatModel, countTokens, generateTextAsMessages, Messages } from '../../lib/openAIClient.mts';
import { filesAsSmallDescription, systemCommandsMessage, systemLanguageMessage } from './systemMessages';
import inquirer from 'inquirer';
import pc from 'picocolors'
import { setTimeout } from 'timers/promises';

// options
const canMutate = true
// const accumulateContext = true

export interface FileCommand {
  type: 'command'
  // read - прочитать файл для того чтоб потом применить какую-нибудь команду для которой нужно знать содержимое этого файла
  // create/update - создать и изменить файл, команда не умеет создавать директорию. Создавая файл в какой-то папке директория создастся автоматически
  // delete - удалить файл
  action: 'create' | 'read' | 'update' | 'delete';
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

// выполнение команды в консоли
// export interface ConsoleCommand {
//   type: 'console-command'
//   action: 'need-info' | 'split_into_small_tasks';
//   prompt: string;
// }

export type Command = MetaCommand | FileCommand | InfoCommand | SplitCommand;

export async function executeCommands(commands: Command[], model: ChatModel, chatHistory: Messages) {
  for (const command of commands) {
    await setTimeout(400)

    const tokenLength = countTokens(
      chatHistory.reduce((a, i) => a + i.content, ''),
      model
    )

    if (chatHistory.length > 40 && tokenLength > 45_000) {
      console.log('Оптимизируем контекст, он слишком большой')
      const oldHistory = chatHistory.splice(0, 10)
      const res = await generateTextAsMessages([
        {
          role: 'system',
          content: `
          Вот есть история переписки. Дай краткий пересказ о том, что написано в этих сообщениях в хронологическом порядке.
          ${JSON.stringify(oldHistory)}
          `
        }
      ], model)

      if (res) {
        chatHistory.unshift({
          role: 'system',
          content: `
          Вот то, о чем шло общение раньше. История сжата в это небольшое сообщение:
          ${res}
          `
        })
      }
    }

    try {
      switch (command.action) {
        case 'need-info': {
          const { userResponse } = await inquirer.prompt([
            {
              type: 'input',
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
              role: 'system',
              content: systemLanguageMessage(),
            },
            {
              role: 'user',
              content: userResponse
            }
          ];

          chatHistory.push(...m)

          const newCommands = await generateCommands(chatHistory, model,)
          
          chatHistory.push(
            {
              role: 'assistant',
              content: JSON.stringify(newCommands)
            }
          );
          
          await executeCommands(newCommands, model, m)
          break
        }
        case 'split_into_small_tasks': {

          const m: Messages = [
            {
              role: 'system',
              content: `Давай эту задачу разобьем на конкретные команды работы над файлами`
            },
            {
              role: 'system',
              content: systemLanguageMessage(),
            },
            {
              role: 'user',
              content: command.prompt
            }
          ];

          chatHistory.push(...m)

          const newCommands = await generateCommands(chatHistory, model,)

          chatHistory.push(
            {
              role: 'assistant',
              content: JSON.stringify(newCommands)
            }
          );

          await executeCommands(newCommands, model, m)
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

          const newCommands = await generateCommands(chatHistory, model,)

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

          await executeCommands(newCommands, model, m)
          break;
        }

        case 'create':
        case 'update': {
          const filePath = path.resolve(command.filePath);

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
              filesContext(),
              {
                role: 'system',
                content: `
                Мы генерируем новые файлы для проекта по заданию пользователя. Учитывай то, какие файлы уже есть и делай соответствующую работу.
                Ты сейчас будешь работать с файлом ${command.filePath}. Сгенерируй только сам контент этого файла БЕЗ МАРКДАУНА, и без вспомогательных символов, 
                только текст который необходимо вставить в файл иначе ничего не будет работать, например:
                Плохо:
                // файл.расширение
                \`\`\`тип файла
                ...тут содержимое ответа
                \`\`\`

                Хорошо:
                // файл.расширение
                содержимое ответа без лищних символов

                Пришли строго только код, который нужно вставить в файл
                `,
              },
              {
                role: 'user',
                content: command.prompt
              }
            ], model)
  
            if (!res) {
              return
            }
  
            await fs.writeFile(filePath, res, 'utf-8');
            await addFileToContext(filePath, model)
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
          const filePath = path.resolve(command.filePath);

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
          const filePath = path.resolve(command.filePath);
          
          if (canMutate) {
            await fs.unlink(filePath);
          }
          await removeFileFromContext(filePath)
          console.log(`File deleted: ${command.filePath}`);
          break;
        }

        case 'terminate': {
          
          return
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

// Example JSON commands
// const commands: Command[] = [
//   { action: 'create', filePath: 'example.txt', content: 'Hello, World!' },
//   { action: 'read', filePath: 'example.txt' },
//   { action: 'update', filePath: 'example.txt', content: 'Updated content' },
//   { action: 'delete', filePath: 'example.txt' },
// ];

// executeCommands(commands).catch(err => console.error(err));

const filesContext = (): Messages[number] => {

  return {
    role: 'system',
    content: filesAsSmallDescription(),
  }
}

async function generateCommands(messages: Messages, model: ChatModel) {
  const systemMessages: Messages = [
    {
      role: 'system',
      content: systemCommandsMessage,
    },
  ]

  const allMessages: Messages = [
    filesContext(),
    ...messages,
    ...systemMessages,
  ]

  const res = await generateTextAsMessages(
    allMessages,
    model
  );

  console.log(res)

  const {
    confirm,
  } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'confirm',
      message: 'Вы согласны с этими командами ?'
    }
  ])

  if (!confirm) {
    // попробовать еще раз
    console.error('плохие команды')
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