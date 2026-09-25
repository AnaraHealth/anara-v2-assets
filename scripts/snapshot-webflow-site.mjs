#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { mkdir, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const sourceOrigin = 'https://www.anara.health';
const projectRoot = process.cwd();
const outputRoot = path.join(projectRoot, 'webflow-site');
const stagingRoot = path.join(projectRoot, `.webflow-site-${Date.now()}`);
const userAgent = 'AnaraStaticMirror/1.0';

const pageResponses = new Map();
const redirectResponses = new Map();
const assetRecords = new Map();
const failedAssets = [];

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function routeForUrl(urlValue) {
  const url = new URL(urlValue);
  return url.pathname === '/' ? '/' : url.pathname.replace(/\/$/, '');
}

function pageFileForRoute(route) {
  return route === '/' ? 'index.html' : path.join(route.slice(1), 'index.html');
}

function safeBasename(url) {
  let name;
  try {
    name = decodeURIComponent(path.basename(url.pathname));
  } catch {
    name = path.basename(url.pathname);
  }
  name = name.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
  return name.slice(-90) || 'asset';
}

function extensionFor(url, contentType) {
  const basename = safeBasename(url);
  const extension = path.extname(basename).toLowerCase();
  if (extension && extension.length <= 8) return extension;

  const normalizedType = contentType.split(';', 1)[0].trim().toLowerCase();
  return new Map([
    ['text/css', '.css'],
    ['text/javascript', '.js'],
    ['application/javascript', '.js'],
    ['image/avif', '.avif'],
    ['image/gif', '.gif'],
    ['image/jpeg', '.jpg'],
    ['image/png', '.png'],
    ['image/svg+xml', '.svg'],
    ['image/webp', '.webp'],
    ['font/woff', '.woff'],
    ['font/woff2', '.woff2'],
    ['application/font-woff', '.woff']
  ]).get(normalizedType) ?? '';
}

function isAssetUrl(url) {
  if (!['http:', 'https:'].includes(url.protocol)) return false;
  if (url.pathname === '/' || url.pathname.endsWith('/')) return false;
  if (url.origin === sourceOrigin) return url.pathname.startsWith('/avlj');

  const assetHosts = new Set([
    'ajax.googleapis.com',
    'cdn.jsdelivr.net',
    'cdn.prod.website-files.com',
    'd3e54v103j8qbb.cloudfront.net',
    'fonts.googleapis.com',
    'fonts.gstatic.com'
  ]);
  return assetHosts.has(url.hostname);
}

function normalizedAssetUrl(value, baseUrl) {
  const trimmed = value.trim().replace(/^['"]|['"]$/g, '');
  if (!trimmed || /^(?:data:|blob:|javascript:|mailto:|tel:|#)/i.test(trimmed)) return undefined;
  try {
    const url = new URL(trimmed.replace(/^\/\//, 'https://'), baseUrl);
    url.hash = '';
    return isAssetUrl(url) ? url.href : undefined;
  } catch {
    return undefined;
  }
}

function discoverHtmlAssets(html, pageUrl) {
  const urls = new Set();
  const attributePatterns = [
    /\b(?:src|poster)\s*=\s*["']([^"']+)["']/gi,
    /\bsrcset\s*=\s*["']([^"']+)["']/gi,
    /<link\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>/gi,
    /\bcontent\s*=\s*["'](https?:\/\/[^"']+)["']/gi
  ];

  for (const pattern of attributePatterns) {
    for (const match of html.matchAll(pattern)) {
      const candidates = pattern.source.includes('srcset')
        ? match[1].split(',').map((part) => part.trim().split(/\s+/, 1)[0])
        : [match[1]];
      for (const candidate of candidates) {
        const url = normalizedAssetUrl(candidate, pageUrl);
        if (url) urls.add(url);
      }
    }
  }

  for (const match of html.matchAll(/url\(\s*([^)]+?)\s*\)/gi)) {
    const url = normalizedAssetUrl(match[1], pageUrl);
    if (url) urls.add(url);
  }

  return urls;
}

function discoverCssAssets(css, stylesheetUrl) {
  const urls = new Set();
  for (const match of css.matchAll(/url\(\s*([^)]+?)\s*\)/gi)) {
    const url = normalizedAssetUrl(match[1], stylesheetUrl);
    if (url) urls.add(url);
  }
  for (const match of css.matchAll(/@import\s+(?:url\()?\s*["']?([^"')\s;]+)["']?\s*\)?/gi)) {
    const url = normalizedAssetUrl(match[1], stylesheetUrl);
    if (url) urls.add(url);
  }
  return urls;
}

async function fetchText(url) {
  const response = await fetch(url, {
    redirect: 'manual',
    headers: { 'user-agent': userAgent },
    signal: AbortSignal.timeout(30_000)
  });
  return { response, text: await response.text() };
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

const sitemapResponse = await fetch(`${sourceOrigin}/sitemap.xml`, {
  headers: { 'user-agent': userAgent },
  signal: AbortSignal.timeout(30_000)
});
if (!sitemapResponse.ok) throw new Error(`Sitemap returned HTTP ${sitemapResponse.status}`);
const sitemapXml = await sitemapResponse.text();
const pageUrls = [...sitemapXml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
if (!pageUrls.includes(sourceOrigin) && !pageUrls.includes(`${sourceOrigin}/`)) pageUrls.push(sourceOrigin);
for (const requiredLegacyUrl of [
  `${sourceOrigin}/same-day-doctor-visits-chandigarh`
]) {
  if (!pageUrls.includes(requiredLegacyUrl)) pageUrls.push(requiredLegacyUrl);
}

await runPool(pageUrls, async (url) => {
  const { response, text } = await fetchText(url);
  const route = routeForUrl(url);
  if (response.status >= 300 && response.status < 400) {
    const location = response.headers.get('location');
    if (!location) throw new Error(`${url} returned ${response.status} without Location`);
    redirectResponses.set(route, { status: response.status, location: new URL(location, url).href });
    return;
  }
  if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}`);
  pageResponses.set(route, { url, html: text, sourceSha256: sha256(text) });
}, 8);

const queuedAssets = new Set();
for (const page of pageResponses.values()) {
  for (const assetUrl of discoverHtmlAssets(page.html, page.url)) queuedAssets.add(assetUrl);
}

while (true) {
  const batch = [...queuedAssets].filter((url) => !assetRecords.has(url));
  if (batch.length === 0) break;

  await runPool(batch, async (urlValue) => {
    try {
      const url = new URL(urlValue);
      const response = await fetch(url, {
        redirect: 'follow',
        headers: { 'user-agent': userAgent },
        signal: AbortSignal.timeout(45_000)
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const contentType = response.headers.get('content-type') ?? 'application/octet-stream';
      const bytes = Buffer.from(await response.arrayBuffer());
      const extension = extensionFor(url, contentType);
      const basename = safeBasename(url).replace(new RegExp(`${extension.replace('.', '\\.')}$$`, 'i'), '');
      const relativePath = path.posix.join(
        'assets',
        url.hostname.replace(/[^a-zA-Z0-9.-]/g, '-'),
        `${sha256(urlValue).slice(0, 16)}-${basename}${extension}`
      );
      const record = { url: urlValue, relativePath, contentType, bytes };
      assetRecords.set(urlValue, record);

      if (/text\/css/i.test(contentType) || extension === '.css') {
        const css = bytes.toString('utf8');
        for (const discoveredUrl of discoverCssAssets(css, urlValue)) queuedAssets.add(discoveredUrl);
      }
    } catch (error) {
      failedAssets.push({ url: urlValue, error: error.message });
      assetRecords.set(urlValue, { url: urlValue, failed: true, error: error.message });
    }
  }, 12);
}

const criticalAssetFailures = failedAssets.filter(({ url }) => {
  const parsed = new URL(url);
  return parsed.hostname === 'cdn.prod.website-files.com'
    || url.includes('/gh/AnaraHealth/anara-v2-assets@');
});
if (criticalAssetFailures.length > 0) {
  throw new Error(`Failed to copy ${criticalAssetFailures.length} required assets:\n${criticalAssetFailures.map((item) => `- ${item.url}: ${item.error}`).join('\n')}`);
}
if (failedAssets.length > 0) {
  console.warn(`Left ${failedAssets.length} already-failing live dependencies unchanged:\n${failedAssets.map((item) => `- ${item.url}: ${item.error}`).join('\n')}`);
}

function localAssetPath(url) {
  const record = assetRecords.get(url);
  return record && !record.failed ? `/${record.relativePath}` : undefined;
}

function rewriteCss(css, stylesheetUrl) {
  return css
    .replace(/url\(\s*([^)]+?)\s*\)/gi, (full, rawValue) => {
      const resolved = normalizedAssetUrl(rawValue, stylesheetUrl);
      const replacement = resolved ? localAssetPath(resolved) : undefined;
      return replacement ? `url("${replacement}")` : full;
    })
    .replace(/@import\s+(?:url\()?\s*["']?([^"')\s;]+)["']?\s*\)?/gi, (full, rawValue) => {
      const resolved = normalizedAssetUrl(rawValue, stylesheetUrl);
      const replacement = resolved ? localAssetPath(resolved) : undefined;
      return replacement ? `@import url("${replacement}")` : full;
    });
}

function rewriteHtml(html) {
  let rewritten = html;
  for (const [url, record] of assetRecords) {
    if (record.failed) continue;
    rewritten = rewritten.split(url).join(`/${record.relativePath}`);
    rewritten = rewritten.split(url.replaceAll('&', '&amp;')).join(`/${record.relativePath}`);
    const parsed = new URL(url);
    if (parsed.origin === sourceOrigin) {
      rewritten = rewritten
        .split(`${parsed.pathname}${parsed.search}`)
        .join(`/${record.relativePath}`);
    }
  }
  rewritten = rewritten
    .replace(/https:\/\/cdn\.jsdelivr\.net\/gh\/AnaraHealth\/anara-v2-assets@[a-f0-9]+\//g, '/')
    .replace(/(\b(?:href|src|action)=["'])https:\/\/www\.anara\.health/gi, '$1')
    .replace(/(\b(?:href|src|action)=["'])https:\/\/anara\.health/gi, '$1')
    .replace(/\s+integrity=["'][^"']+["']/gi, '')
    .replace(/\s+crossorigin=["']anonymous["']/gi, '');
  return rewritten;
}

await mkdir(stagingRoot, { recursive: false });

for (const [route, page] of pageResponses) {
  const destination = path.join(stagingRoot, pageFileForRoute(route));
  await mkdir(path.dirname(destination), { recursive: true });
  const html = rewriteHtml(page.html);
  await writeFile(destination, html);
  page.mirrorSha256 = sha256(html);
}

for (const record of assetRecords.values()) {
  if (record.failed) continue;
  const destination = path.join(stagingRoot, record.relativePath);
  await mkdir(path.dirname(destination), { recursive: true });
  const content = /text\/css/i.test(record.contentType) || record.relativePath.endsWith('.css')
    ? rewriteCss(record.bytes.toString('utf8'), record.url)
    : record.bytes;
  await writeFile(destination, content);
  record.bytesWritten = Buffer.byteLength(content);
}

const routes = [...pageResponses.keys()]
  .filter((route) => route !== '/')
  .sort()
  .map((route) => ({ route, rewrite: `/${pageFileForRoute(route).replaceAll(path.sep, '/')}` }));

for (const [route, redirect] of [...redirectResponses].sort(([left], [right]) => left.localeCompare(right))) {
  const targetUrl = new URL(redirect.location);
  routes.push({
    route,
    redirect: targetUrl.origin === sourceOrigin
      ? `${targetUrl.pathname}${targetUrl.search}${targetUrl.hash}`
      : redirect.location,
    statusCode: redirect.status
  });
}

routes.push({
  route: '/assets/*',
  headers: { 'cache-control': 'public, max-age=31536000, immutable' }
});

const staticWebAppConfig = {
  '$schema': 'https://json.schemastore.org/staticwebapp.config.json',
  routes,
  responseOverrides: { '404': { rewrite: '/404.html' } },
  globalHeaders: {
    'content-security-policy': "default-src 'self' https: data: blob:; script-src 'self' 'unsafe-inline' https:; style-src 'self' 'unsafe-inline' https:; img-src 'self' https: data: blob:; font-src 'self' https: data:; connect-src 'self' https:; frame-src 'self' https:; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self' https:; upgrade-insecure-requests",
    'referrer-policy': 'strict-origin-when-cross-origin',
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY',
    'permissions-policy': 'camera=(), geolocation=(), microphone=(), payment=(), usb=()'
  },
  mimeTypes: {
    '.avif': 'image/avif',
    '.webp': 'image/webp',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2'
  }
};
await writeFile(path.join(stagingRoot, 'staticwebapp.config.json'), `${JSON.stringify(staticWebAppConfig, null, 2)}\n`);
await writeFile(path.join(stagingRoot, 'sitemap.xml'), sitemapXml);

const notFoundHtml = '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Page not found | Anara Health</title><meta http-equiv="refresh" content="4;url=/"></head><body><main><h1>Page not found</h1><p><a href="/">Return to Anara Health</a></p></main></body></html>\n';
await writeFile(path.join(stagingRoot, '404.html'), notFoundHtml);

const manifest = {
  sourceOrigin,
  capturedAt: new Date().toISOString(),
  pages: [...pageResponses].sort(([left], [right]) => left.localeCompare(right)).map(([route, page]) => ({
    route,
    file: pageFileForRoute(route).replaceAll(path.sep, '/'),
    sourceSha256: page.sourceSha256,
    mirrorSha256: page.mirrorSha256
  })),
  redirects: [...redirectResponses].sort(([left], [right]) => left.localeCompare(right)).map(([route, redirect]) => ({ route, ...redirect })),
  assets: [...assetRecords.values()].map((record) => ({
    url: record.url,
    file: record.relativePath,
    contentType: record.contentType,
    bytes: record.bytesWritten,
    failed: record.failed,
    error: record.error
  })).sort((left, right) => left.url.localeCompare(right.url))
};
await writeFile(path.join(stagingRoot, 'snapshot-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

await rename(stagingRoot, outputRoot);

const totalBytes = manifest.assets.reduce((sum, asset) => sum + (asset.bytes ?? 0), 0);
console.log(JSON.stringify({
  outputRoot,
  capturedAt: manifest.capturedAt,
  pages: manifest.pages.length,
  redirects: manifest.redirects.length,
  assets: manifest.assets.length,
  assetBytes: totalBytes
}, null, 2));
