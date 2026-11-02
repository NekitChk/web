import { chromium } from 'playwright';
import { readdir } from 'node:fs/promises';
import { createServer } from 'node:http';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { join, resolve, relative, extname, sep } from 'node:path';

const ROOT = process.cwd();
const PORT = 8765;

const mimeTypes = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'text/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.webp': 'image/webp',
    '.ico': 'image/x-icon',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2'
};

async function findIndexFiles(directory) {
    const files = [];

    const entries = await readdir(directory, {
        withFileTypes: true
    });

    for (const entry of entries) {
        if (['.git', '.github', 'node_modules', 'tools'].includes(entry.name)) {
            continue;
        }

        const path = join(directory, entry.name);

        if (entry.isDirectory()) {
            files.push(...await findIndexFiles(path));
        } else if (entry.isFile() && entry.name.toLowerCase() === 'index.html') {
            files.push(path);
        }
    }

    return files;
}

const server = createServer(async (req, res) => {
    try {
        const url = new URL(req.url, `http://localhost:${PORT}`);
        const decodedPath = decodeURIComponent(url.pathname);

        const filePath = resolve(ROOT, '.' + decodedPath);

        if (filePath !== ROOT && !filePath.startsWith(ROOT + sep)) {
            res.writeHead(403);
            res.end();
            return;
        }

        const info = await stat(filePath);

        if (!info.isFile()) {
            res.writeHead(404);
            res.end();
            return;
        }

        const content = await readFile(filePath);
        const type = mimeTypes[extname(filePath)] || 'application/octet-stream';

        res.writeHead(200, { 'Content-Type': type });
        res.end(content);
    } catch {
        res.writeHead(404);
        res.end('Not found');
    }
});

await new Promise(resolve => server.listen(PORT, '127.0.0.1', resolve));

let browser;

try {
    browser = await chromium.launch({ headless: true });

    const page = await browser.newPage({
        viewport: { width: 2560, height: 1440 },
        deviceScaleFactor: 1
    });

    const files = await findIndexFiles(ROOT);

    console.log(`Found ${files.length} HTML pages`);

    for (const file of files) {
        const relativePath = relative(ROOT, file);

        const urlPath = relativePath
            .split(sep)
            .map(encodeURIComponent)
            .join('/');

        const url = `http://127.0.0.1:${PORT}/${urlPath}`;

        const screenshotPath = join(
            resolve(file, '..'),
            'screenshot.png'
        );

        console.log(`Opening: ${url}`);

        await page.goto(url, {
            waitUntil: 'networkidle',
            timeout: 30000
        });

        await page.evaluate(() => document.fonts.ready);

        await page.screenshot({
            path: screenshotPath,
            fullPage: true,
            animations: 'disabled'
        });

      const readmePath = join(
          resolve(file, '..'),
          'README.md'
      );


      const readmeContent = `# Лабораторная работа ![Скриншот лабораторной работы](./screenshot.png)`;


      await writeFile(readmePath, readmeContent, 'utf8');

      console.log(`Saved: ${readmePath}`);
    }
} finally {
    if (browser) await browser.close();
    server.close();
}
