#!/usr/bin/env node
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const outputRoot = path.join(projectRoot, 'dist');
const fail = (message) => {
    console.error(`[login-build] FAIL ${message}`);
    process.exit(1);
};

let html;
try {
    html = await readFile(path.join(outputRoot, 'index.html'), 'utf8');
} catch {
    fail('dist/index.html is missing. Confirm Vercel builds the repository root with npm run build.');
}

if (!html.includes('href="/favicon.svg"')) {
    fail('The generated page does not reference the OneMed favicon.');
}

const cssPaths = [...html.matchAll(/href="([^\"]+\.css)"/g)].map((match) => match[1]);
if (!cssPaths.length) fail('The generated page does not reference a CSS bundle.');

let loginStylesPath = '';
for (const urlPath of cssPaths) {
    const relativePath = decodeURIComponent(urlPath).replace(/^\//, '');
    const filePath = path.resolve(outputRoot, relativePath);
    if (!filePath.startsWith(`${outputRoot}${path.sep}`)) fail(`CSS path escapes dist: ${urlPath}`);
    try {
        await access(filePath);
    } catch {
        fail(`CSS asset referenced by index.html is missing: ${urlPath}`);
    }
    const css = await readFile(filePath, 'utf8');
    if (css.includes('--neu-bg') && css.includes('.login-card')) loginStylesPath = urlPath;
}

if (!loginStylesPath) {
    fail('The generated CSS bundles do not contain the neumorphic login styles (--neu-bg).');
}

try {
    await access(path.join(outputRoot, 'favicon.svg'));
} catch {
    fail('The favicon referenced by index.html is missing from dist.');
}

console.log(`[login-build] PASS login styles and favicon are present in the production output (${loginStylesPath}).`);
