#!/usr/bin/env node

import { cp, mkdir, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const projectRoot = process.cwd();
const sourceRoot = path.join(projectRoot, 'webflow-site');
const outputArgument = process.argv[2];

if (!outputArgument) {
  console.error('Usage: node scripts/build-static-site.mjs .azure/artifacts/<unique-name>');
  process.exit(2);
}

const artifactsRoot = path.join(projectRoot, '.azure', 'artifacts');
const outputRoot = path.resolve(projectRoot, outputArgument);
const relativeOutput = path.relative(artifactsRoot, outputRoot);

if (relativeOutput.startsWith('..') || path.isAbsolute(relativeOutput) || relativeOutput === '') {
  console.error('Output must be a new child directory of .azure/artifacts/.');
  process.exit(2);
}

try {
  await stat(outputRoot);
  console.error(`Refusing to overwrite existing output: ${outputRoot}`);
  process.exit(2);
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}

await mkdir(outputRoot, { recursive: true });
await cp(sourceRoot, outputRoot, { recursive: true });

async function summarize(directory) {
  let fileCount = 0;
  let totalBytes = 0;

  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      const child = await summarize(entryPath);
      fileCount += child.fileCount;
      totalBytes += child.totalBytes;
    } else if (entry.isFile()) {
      const file = await stat(entryPath);
      fileCount += 1;
      totalBytes += file.size;
    }
  }

  return { fileCount, totalBytes };
}

const summary = await summarize(outputRoot);
console.log(JSON.stringify({ outputRoot, ...summary }, null, 2));
