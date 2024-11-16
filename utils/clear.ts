import fs from 'fs/promises';
import path from 'path';

const folderPath = './src';

async function removeMarkdownFences(folder: string) {
  const entries = await fs.readdir(folder, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(folder, entry.name);
    if (entry.isDirectory()) {
      await removeMarkdownFences(fullPath);
    } else if (entry.isFile()) {
      let content = await fs.readFile(fullPath, 'utf-8');
      content = content.replace(/^```markdown\s*/, '').replace(/```\s*$/, '');
      await fs.writeFile(fullPath, content, 'utf-8');
      console.log(`Processed ${fullPath}`);
    }
  }
}

removeMarkdownFences(folderPath).catch(console.error);

