// // import OpenAI from "openai";
// import { z } from "zod";
// import { zodResponseFormat } from "openai/helpers/zod";

// // const openai = new OpenAI();

// const Step = z.object({
//   explanation: z.string(),
//   output: z.string(),
// });

// const MathReasoning = z.object({
//   steps: z.array(Step),
//   final_answer: z.string(),
// });

// console.log(zodResponseFormat(MathReasoning, "math_reasoning"))

// process.exit()

// const completion = await openai.beta.chat.completions.parse({
//   model: "gpt-4o-2024-08-06",
//   messages: [
//     { role: "system", content: "You are a helpful math tutor. Guide the user through the solution step by step." },
//     { role: "user", content: "how can I solve 8x + 7 = -23" },
//   ],
//   response_format: zodResponseFormat(MathReasoning, "math_reasoning"),
// });

// const math_reasoning = completion.choices[0].message.parsed;