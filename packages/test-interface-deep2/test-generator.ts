import picocolors from 'picocolors';
import { createCompletention } from './LLM_Client'
import { FileContext, RunProps, } from './types';
import { extractJson, tryes } from './utils'

import pLimit from 'p-limit'

const limit = pLimit(1)

export class TestGenerator {
  private perfectTest: {code: string, description: string}

  constructor(private props: RunProps) {}


  async initPerfectTest(){

    const generatePerfectTest = async () => {
      const res = await createCompletention({
        temperature: 0.2,
        model: this.props.model,
        messages: [
          {
            role: 'system',
            content: `
            Generate ${this.props.framework} tests for ${
              this.props.language
            }. Follow best practices. Include:\n- Test descriptions\n- Proper mocks\n- Clean assertions.
            
            Give an example of an ideal test, use frequently used libraries, approaches, and solutions.

            Respond in JSON format(use " symbols for strings) without mardown: {
              "code": "string",
              "description": "sting"
            }

            Special characters must be escaped according to the JSON specification.
            `
          },
        ],
        response_format: { type: 'json_object' },
      })

      return res.choices[0].message.content;
    }

    const array = await Promise.all(
      Array(3).fill(null)
        .map(async (item) => {
          
          return tryes(async () => {

            const content = await limit(() => {
              return generatePerfectTest();
            })

            if (!content) {
              throw new Error('No content')
            }

            const extractedText = extractJson(content)

            if (!extractedText) {
              throw new Error('No JSON text')
            }

            try {
              return JSON.parse(extractedText) as {code: string, description: string}
            } catch {
              throw new Error('No JSON');
            }
          })
        })
        .filter(Boolean)
    )

    await tryes(async () => {  
      const response = await createCompletention({
        messages: [
          {
            role: 'system',
            content: `
              We have ${array.length} test samples based on ${this.props.framework} and ${this.props.language}.
  
              You need select a best test sample.
  
              ${array.map((item, index) => {
                return `
                Number: ${index}
                Code: ${item?.code}
                `
              })}
  
              Respond in JSON format without mardown: {
                // Порядковый номер лучшего тест кейса
                bestIndex: number,
                // описание почему этот вариант самый лучший
                description: sting
              }

              Special characters must be escaped according to the JSON specification.
            `
          }
  
        ],
        model: this.props.model,
      })
  
      const content = response.choices[0].message.content
  
      if (!content) {
        throw new Error('No content')
      }
  
      const jsonText = extractJson(content);

      if (!jsonText) {
        throw new Error('No JSON text')
      }
      
      try {
        const {bestIndex, description} = JSON.parse(jsonText) as {bestIndex: number, description: string};
    
        if (!array[bestIndex]) {
          console.log(`Не удалось получить идеальный тест`)
        }
    
        this.perfectTest = {
          code: array[bestIndex]!.code,
          description,
        }
        return;
      } catch (err) {
        console.log(err)
        throw new Error('No JSON')
      }
    })
  }


  async generateTestSuite(context: FileContext[]) {
    const testCases = await this.generateTestCases(context);
    if (!testCases) {
      throw new Error(`Нет тест кейсов. Не удастся сгенерировать тесты.`)
    }
    return this.generateTestCode(context, testCases);
  }
  
  async *generateTestSuite2(context: FileContext[]): AsyncGenerator<
    number, 
    {
      code: string,
      description: string,
    }
  > {
    const testCases = await this.generateTestCases(context);

    if (!testCases) {
      throw new Error(`Нет тест кейсов. Не удастся сгенерировать тесты.`)
    }
    
    yield 1;
    
    const result = await this.generateTestCode(context, testCases);

    if (!result) {
      throw new Error(`No tests as result. I dont know why`);
    }

    yield 2;

    return result
  }

  private async generateTestCases(
    [base, ...context]: FileContext[],
  ) {

    let tries = 2;

    do {
      const response = await createCompletention({
        model: this.props.model,
        messages: [{
          role: "system",
          content: `Generate comprehensive test cases considering:
          My project files:
          ${context.map(item => `
            File path: ${item.path}
            File content: ${item.content}
          `)}
          `
        }, {
          role: "user",
          content: `Generate test scenarios for ${base.path}
          My code: ${base.content}


          including edge cases and error handling.
          Respond in JSON format without mardown: {
            cases: [{
              // what is this case
              title: string,
              // how we check this case
              check: string,

              // What edge cases can there be in this case
              edgeCases: string
            }]
          }

          Special characters must be escaped according to the JSON specification.
          `
        }],
        temperature: 0.3
      });

      try {
        return this.parseTestCases(response.choices[0].message.content || '');
      } catch (error) {
        continue; 
      }
  } while (--tries);
}

  private parseTestCases(text: string): {
    cases: {
      title: string,
      check: string,
      edgeCases: string,
    }[]
  }[] {
    try {
      const jsonText = extractJson(text);
      
      if (!jsonText) {
        throw new Error('Нет ')
      }

      return JSON.parse(jsonText);
    } catch (error) {
      console.error('Failed to parse test cases:', text);
      return [];
    }
  }

  private async generateTestCode(
    [base, ...context]: FileContext[], 
    testCases: any[],
  ) {

    const result = await tryes(async () => {

      const response = await createCompletention({
        model: this.props.model,
        messages: [{
          role: "system",
          content: `Generate ${this.props.framework} tests for ${
            this.props.language
          }. Follow best practices. Include:\n- Test descriptions\n- Proper mocks\n- Clean assertions
          
          For example see this sample:
          ${this.perfectTest.code}
          `
        }, {
          role: "user",
          content: `Context:
          Main File Path: ${base.path}
          Main File Content: ${base.content}
          
          
          Dependencies: ${
            context.map(d => `
              ========
              ${d.path} (${d.content})`).join('\n')
          }
          
          Needed Test Cases for Main File:
          ${JSON.stringify(testCases, null, 2)}
          
          
          Respond in JSON format without mardown: {
            code: string,
            description: sting
          }
  
          Special characters must be escaped according to the JSON specification.
          `
        }],
        temperature: 0.2,
        response_format: { type: 'json_object' },
      });
  
      return this.parseTestCode(response.choices[0].message.content);
    })
    
    return result;
  }

  private async parseTestCode(text: string): Promise<{
    code: string,
    description: string,
  }> {
    try {
      const jsonText = extractJson(text);

      return  JSON.parse(jsonText);
    } catch (error) {

      console.info(picocolors.red('I can\'t extract JSON'))
      console.debug('\n Error in generate test code: \n', text)
      console.error(error)
    }

    console.info(picocolors.blue('I try parse JSON with LLM'))

    const json = await createCompletention({
      messages: [
        {
          role: 'system',
          content: `
            Need extract json from message.            
            Transform user data to pure JSON without formattings.
            Use fields structure from user data.
            Use JSON with standard, use double quotes for JSON fields, use escaping and correct syntax.
            Respond with JSON without markdown.

          `
        }, {
          role: 'user',
          content: text,
        }
      ],
      model: this.props.model,
      temperature: 0.5,
      response_format: {type: 'json_object'},
    })

    const jsonText = extractJson(json.choices[0].message.content);

    if (!jsonText) {
      throw new Error(picocolors.red('I can\'t extract code from LLM response'));
    }

    return JSON.parse(jsonText);
  }
}