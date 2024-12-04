import { createServer } from 'http';
import { parse } from 'url';
import { generateText } from './openAIClient.mts';
import minimist from 'minimist';
import fs from 'fs/promises';

const PORT = 3000;
const resPath = 'QUESTION.response.md';
const historyPath = 'QUESTION.history.json';

const args = minimist(process.argv.slice(2), {
    default: {
        model: 'gpt-4o',
        ctx: true
    },
    alias: {
        m: 'model',
        c: 'ctx'
    }
});

let history = [];
if (args.c && fs.stat(historyPath).then(() => true).catch(() => false)) {
    history = JSON.parse(await fs.readFile(historyPath, 'utf8'));
}

const requestListener = async (req, res) => {
    const { query } = parse(req.url || '', true);
    const { question } = query;
    
    if (!question) {
        res.writeHead(400, { 'Content-Type': 'text/plain' });
        res.end('Please provide a question parameter.');
        return;
    }
    
    try {
        const context = args.ctx ? history.join('\n') : undefined;
        const answer = await generateText(question, args.model, context);
        
        if (args.ctx) {
            history.push(question);
            history.push(answer);
            await fs.writeFile(historyPath, JSON.stringify(history, null, 2));
        }
        
        await fs.writeFile(resPath, answer);
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ question, answer }));
    } catch (error) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: error.message }));
    }
};

const server = createServer(requestListener);
server.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
