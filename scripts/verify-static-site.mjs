#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const args = process.argv.slice(2);
const valueFor = (name) => {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
};

const projectRoot = process.cwd();
const siteRoot = path.resolve(projectRoot, valueFor('--local') ?? 'webflow-site');
const baseUrlValue = valueFor('--base-url');
const baseUrl = baseUrlValue ? new URL(baseUrlValue) : undefined;
const compareLive = args.includes('--compare-live');
const liveOrigin = 'https://www.anara.health';
const failures = [];
const checks = [];

function check(condition, message) {
  if (condition) checks.push(message);
  else failures.push(message);
}

async function exists(filePath) {
  try {
    return (await stat(filePath)).isFile();
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

function meaningfulLines(text) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'));
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function visibleText(html) {
  return html
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--([\s\S]*?)-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;|&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/&amp;/gi, '&')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizedLocation(location, origin) {
  const parsed = new URL(location, origin);
  return `${parsed.pathname}${parsed.search}${parsed.hash}`;
}

async function fetchManual(origin, route) {
  return fetch(new URL(route, origin), {
    redirect: 'manual',
    signal: AbortSignal.timeout(30_000),
    headers: { 'user-agent': 'AnaraStaticSiteVerifier/2.0' }
  });
}

async function runPool(items, worker, concurrency = 8) {
  let nextIndex = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (nextIndex < items.length) {
      const item = items[nextIndex];
      nextIndex += 1;
      await worker(item);
    }
  });
  await Promise.all(runners);
}

const manifest = JSON.parse(await readFile(path.join(siteRoot, 'snapshot-manifest.json'), 'utf8'));
const config = JSON.parse(await readFile(path.join(siteRoot, 'staticwebapp.config.json'), 'utf8'));
const pages = new Map(manifest.pages.map((page) => [page.route, page]));
const redirects = new Map(manifest.redirects.map((redirect) => [redirect.route, redirect]));

check(manifest.sourceOrigin === liveOrigin, 'Snapshot source is the live www.anara.health site');
check(pages.size === 46, `Snapshot contains 46 live pages (found ${pages.size})`);
check(redirects.size === 3, `Snapshot contains 3 verified live Webflow redirects (found ${redirects.size})`);
check(
  redirects.get('/same-day-doctor-visits-chandigarh')?.location === `${liveOrigin}/same-day-doctor-visits-chandigarh-india`,
  'The non-sitemap Chandigarh URL retains its live redirect'
);
check(manifest.assets.length >= 250, `Snapshot contains at least 250 copied assets (found ${manifest.assets.length})`);

const failedAssets = manifest.assets.filter((asset) => asset.failed);
check(
  failedAssets.length === 1 && failedAssets[0].url.includes('/lucide-react@0.292.0/'),
  'Only the already-broken lucide-react URL remains external'
);

const legacyPaths = meaningfulLines(
  await readFile(path.join(projectRoot, 'tests', 'legacy-webflow-paths.txt'), 'utf8')
);
check(legacyPaths.length === 48, `Captured Webflow sitemap contains 48 paths (found ${legacyPaths.length})`);
check(new Set(legacyPaths).size === legacyPaths.length, 'Captured Webflow sitemap paths are unique');
for (const route of legacyPaths) {
  check(pages.has(route) || redirects.has(route), `Current Webflow route ${route} is copied or preserved as a redirect`);
}

const configuredRewrites = new Map(
  config.routes.filter((route) => route.rewrite).map((route) => [route.route, route.rewrite])
);
const configuredRedirects = new Map(
  config.routes.filter((route) => route.redirect).map((route) => [route.route, route])
);

for (const [route, page] of pages) {
  const filePath = path.join(siteRoot, page.file);
  check(await exists(filePath), `Copied page ${route} exists at ${page.file}`);
  const html = await readFile(filePath, 'utf8');
  check(/<meta\s+[^>]*name=["']viewport["']/i.test(html), `${route} defines a mobile viewport`);

  if (route !== '/') {
    check(configuredRewrites.get(route) === `/${page.file}`, `${route} rewrites to its copied HTML file`);
  }

  const assetReferences = [
    ...html.matchAll(/\b(?:src|poster)\s*=\s*["'](\/assets\/[^"']+)["']/gi),
    ...html.matchAll(/\bsrcset\s*=\s*["']([^"']+)["']/gi)
  ].flatMap((match) => {
    if (match[0].toLowerCase().startsWith('srcset')) {
      return match[1].split(',').map((part) => part.trim().split(/\s+/, 1)[0]);
    }
    return [match[1]];
  }).filter((reference) => reference.startsWith('/assets/'));

  for (const reference of assetReferences) {
    check(await exists(path.join(siteRoot, reference.slice(1))), `${route} asset ${reference} exists`);
  }

  const dependentCdnReference = /(?:src|href)=["']https:\/\/(?:cdn\.prod\.website-files\.com\/.+|d3e54v103j8qbb\.cloudfront\.net\/.+|cdn\.jsdelivr\.net\/gh\/AnaraHealth\/[^"']+)["']/i.test(html);
  check(!dependentCdnReference, `${route} no longer depends on Webflow or Anara CDN files`);
}

for (const [route, redirect] of redirects) {
  const configured = configuredRedirects.get(route);
  check(Boolean(configured), `${route} retains its live redirect`);
  if (!configured) continue;
  check(configured.statusCode === redirect.status, `${route} retains HTTP ${redirect.status}`);
  check(
    normalizedLocation(configured.redirect, liveOrigin) === normalizedLocation(redirect.location, liveOrigin),
    `${route} retains its live redirect destination`
  );
}

for (const asset of manifest.assets.filter((item) => !item.failed)) {
  const filePath = path.join(siteRoot, asset.file);
  check(await exists(filePath), `Copied asset ${asset.file} exists`);
  if (await exists(filePath)) check((await stat(filePath)).size > 0, `Copied asset ${asset.file} is not empty`);
}

const homeHtml = await readFile(path.join(siteRoot, pages.get('/').file), 'utf8');
check(homeHtml.includes('On-site health checks that'), 'Copied homepage contains the current live hero');
check(homeHtml.includes('Everything your workforce needs. One unified programme.'), 'Copied homepage contains the current live services section');
check(homeHtml.includes('Built to transform Indian healthcare.'), 'Copied homepage contains the current live leadership section');
check(homeHtml.includes('What HR &amp; procurement ask first.'), 'Copied homepage contains the current live FAQ section');
check(config.responseOverrides?.['404']?.rewrite === '/404.html', 'Unknown routes use the custom 404 page');

if (baseUrl) {
  await runPool([...pages], async ([route, page]) => {
    const response = await fetchManual(baseUrl, route);
    check(response.status === 200, `${baseUrl.origin}${route} returns HTTP 200 (got ${response.status})`);
    if (response.status !== 200) return;
    const deployedHtml = await response.text();
    const localHtml = await readFile(path.join(siteRoot, page.file), 'utf8');
    check(sha256(visibleText(deployedHtml)) === sha256(visibleText(localHtml)), `${route} deployed visible content matches the snapshot`);

    if (compareLive) {
      const liveResponse = await fetchManual(liveOrigin, route);
      check(liveResponse.status === 200, `${liveOrigin}${route} still returns HTTP 200`);
      if (liveResponse.status === 200) {
        const liveHtml = await liveResponse.text();
        check(sha256(visibleText(deployedHtml)) === sha256(visibleText(liveHtml)), `${route} visible content matches the live Webflow page`);
      }
    }
  }, 6);

  await runPool([...redirects], async ([route, redirect]) => {
    const response = await fetchManual(baseUrl, route);
    check(response.status === redirect.status, `${baseUrl.origin}${route} returns HTTP ${redirect.status}`);
    const location = response.headers.get('location');
    check(Boolean(location), `${route} returns a Location header`);
    if (location) {
      check(
        normalizedLocation(location, baseUrl) === normalizedLocation(redirect.location, liveOrigin),
        `${route} deployed redirect matches live Webflow`
      );
    }
  });

  const missingResponse = await fetchManual(baseUrl, '/__anara_mirror_missing_page__');
  check(missingResponse.status === 404, `Unknown route returns HTTP 404 (got ${missingResponse.status})`);
}

if (failures.length > 0) {
  console.error(`FAILED: ${failures.length} of ${checks.length + failures.length} checks failed.`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`PASS: ${checks.length} checks passed for ${siteRoot}${baseUrl ? ` and ${baseUrl.origin}` : ''}.`);
