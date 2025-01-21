import fs from 'node:fs';
import { generateTextAsMessages, transcribeFile } from './openAIClient.mjs';
import path from 'node:path';
import ffmpeg from 'fluent-ffmpeg'
// import {path as ffpath} from '@ffmpeg-installer/ffmpeg'
import ffpath from 'ffmpeg-static'
import {path as ffPpath} from 'ffprobe-static'

ffmpeg.setFfmpegPath(ffpath)
ffmpeg.setFfprobePath(ffPpath)


export async function splitAudioFile(inputFilePath: string, outputDir: string, chunkSizeMB = 24) {
  // Обернутая функция для работы ffprobe с промисами
  const getMetadata = (filePath: string) => {
    return new Promise<ffmpeg.FfprobeData>((resolve, reject) => {
      ffmpeg.ffprobe(filePath, (err, metadata) => {
        if (err) {
          reject({message: 'Ошибка получения метаданных:', err});
        } else {
          resolve(metadata);
        }
      });
    });
  };

  // Основной код
  try {
    // Получаем имя файла без расширения
    const fileName = path.basename(inputFilePath, path.extname(inputFilePath));

    // Создаем директорию для сохранения частей, если она еще не существует
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const metadata = await getMetadata(inputFilePath);
    const bitrateBytesPerSecond = (metadata.format.bit_rate || 0) / 8;

    if (bitrateBytesPerSecond === 0) {
      throw new Error('Не удалось определить битрейт.');
    }

    const chunkDurationSeconds = (chunkSizeMB * 1024 * 1024) / bitrateBytesPerSecond;

    return new Promise((resolve, reject) => {
      ffmpeg(inputFilePath)
        .outputOptions([
          `-f segment`,
          `-segment_time ${chunkDurationSeconds}`,
          `-reset_timestamps 1`,
          `-c copy`
        ])
        .on('end', () => {
          resolve('Разделение завершено.');
        })
        .on('error', (err) => {
          reject('Ошибка при разделении файла: ' + err);
        })
        .save(path.join(outputDir, `${fileName}-%d.m4a`));
    });
  } catch (error) {
    console.error(error);
    throw error;
  }
}


async function transcribeFilesInFolder(inputFolderPath: string, outputFolderPath: string): Promise<void> {
  const files = fs.readdirSync(inputFolderPath).filter(file => file.endsWith('.m4a'))

  for (const file of files) {
    const filePath = path.join(inputFolderPath, file);
    const fileStream = fs.createReadStream(filePath);
    console.log(filePath, 'Начато')
    const transcription = await transcribeFile(fileStream);
    if (transcription !== null) {
      const outputFilePath = path.join(outputFolderPath, `${path.basename(file, path.extname(file))}.txt`);
      
      fs.mkdirSync(path.dirname(outputFilePath), {recursive: true})
      fs.writeFileSync(outputFilePath, transcription);

      console.log(`Транскрипция для файла ${file} успешно выполнена и записана в ${outputFilePath}.`);
    }
  }
}




function getSortedFiles(folderPath: string): string[] {
  return fs.readdirSync(folderPath)
    .filter(file => file.endsWith('.txt'))
    .filter(file => !file.endsWith('_summary.txt'))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

async function createSummaryFromTranscriptions(textFolderPath: string, outputSummaryFile: string, model: string): Promise<void> {
  const files = getSortedFiles(textFolderPath);

  // console.log(files, textFolderPath);
  
  
  let combinedText = '';

  // Объединяем все файлы в один текст
  for (const file of files) {
    const filePath = path.join(textFolderPath, file);
    const textContent = fs.readFileSync(filePath, 'utf-8');
    combinedText += `\n${textContent}`;
  }

  // Подготовка сообщения для суммаризации
  const messages = [
    { role: 'system', content: `
      у меня есть следующая транскрибация. Распиши подробно и последовательно о чем говорится. Тема - стройка частного дома. сделай реврайт этого разговора, чтоб было комфортно его прочесть. Пиши подробно и в деталях
      
      ` },
    { role: 'user', content: combinedText }
  ];

  console.log('Начало суммаризации комбинированного текста.');

  const summary = await generateTextAsMessages(messages, model);

  if (summary !== null) {
    fs.writeFileSync(outputSummaryFile, summary);
    console.log(`Итоговая суммаризация записана в ${outputSummaryFile}.`);
  } else {
    console.error('Ошибка при получении суммаризации.');
  }
}

async function processAudioFiles(inputDir: string, audioOutputDir: string, textOutputDir: string, model: string): Promise<void> {
  const files = fs.readdirSync(inputDir).filter(file => file.endsWith('.m4a'));

  for (const file of files) {
    const inputFilePath = path.join(inputDir, file);
    const baseName = path.basename(file, path.extname(file));
    const audioSplitDir = path.join(audioOutputDir, baseName);
    const textDir = path.join(textOutputDir, baseName);
    const summaryOutputFile = path.join(textDir, `${baseName}_summary.txt`);

    // Создаем каталоги если их нет
    fs.mkdirSync(audioSplitDir, { recursive: true });
    fs.mkdirSync(textDir, { recursive: true });

    // Шаги по разделению и транскрибированию
    // console.log(`Разделение файла: ${file}`);
    // await splitAudioFile(inputFilePath, audioSplitDir);

    // console.log(`Транскрибирование частей файла: ${file}`);
    // await transcribeFilesInFolder(audioSplitDir, textDir);

    // Суммаризация транскрибированного текста текущего аудиофайла
    console.log(`Создание суммаризации для: ${file}`);
    await createSummaryFromTranscriptions(textDir, summaryOutputFile, model);
  }
}

// Пример использования
const inputAudioDir = './audio';
const splitedAudioDir = './audio/splited';
const textOutputDir = './audio/text';
const model = 'gpt-4o';  // Укажите идентификатор вашей модели

processAudioFiles(inputAudioDir, splitedAudioDir, textOutputDir, model)
  .then(() => console.log("Обработка и суммаризация всех файлов завершена."))
  .catch((error) => console.error('Ошибка в процессе обработки:', error));
  