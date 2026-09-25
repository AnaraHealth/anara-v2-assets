import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '..', 'webflow-site');
const require = createRequire(import.meta.url);
const { initElderCareForm } = require('../webflow-site/elder-care-form.js');

async function page(route) {
  return readFile(path.join(root, route, 'index.html'), 'utf8');
}

function assertSharedShell(html, route) {
  assert.match(html, /<meta[^>]+name="viewport"/i);
  assert.match(html, new RegExp(`<link rel="canonical" href="https://www\\.anara\\.health/${route}"`));
  assert.match(html, /anara-v2-glass\.min\.css/);
  assert.match(html, /elder-care\.css/);
  assert.match(html, /<main id="main"/);
  assert.match(html, /Talk to our care team/i);
  assert.doesNotMatch(html, /webflow\.js|webflow\.schunk|w-nav|w-container/i);
}

test('elder-care page presents the family care journey in the current design system', async () => {
  const html = await page('healthcare');
  assertSharedShell(html, 'healthcare');
  assert.match(html, /When you can(?:&rsquo;|')t be there, <em>Anara can\.<\/em>/i);
  assert.match(html, /Dedicated Care Manager/i);
  assert.match(html, /Hospital accompaniment/i);
  assert.match(html, /How care works/i);
  assert.match(html, /id="plans"/);
  assert.match(html, /Care Plus/);
  assert.match(html, /Care Complete/);
  assert.match(html, /id="faq"/);
  assert.match(html, /action="\/api\/lead"/);
  assert.match(html, /id="familyLeadForm"/);
  assert.doesNotMatch(html, /id="leadForm"/);
  assert.match(html, /name="service" value="Elder care"/);
  assert.doesNotMatch(html, /name="employees" value="elder-care"/);
  assert.match(html, /src="\/elder-care-form\.js"/);
});

test('family form prevents duplicate requests and recovers for a successful retry', async () => {
  let error = null;
  let submit;
  let rejectFirst;
  let calls = 0;
  const attributes = new Map();
  const button = {
    disabled: false,
    setAttribute: (name, value) => attributes.set(name, value),
    removeAttribute: (name) => attributes.delete(name),
  };
  const successClasses = new Set();
  let successFocused = false;
  const success = { classList: { add: (name) => successClasses.add(name) }, focus: () => { successFocused = true; } };
  const form = {
    action: '/api/lead',
    style: {},
    parentElement: { querySelector: () => success },
    addEventListener: (_name, handler) => { submit = handler; },
    checkValidity: () => true,
    reportValidity: () => {},
    querySelector: (selector) => selector === 'button[type="submit"]' ? button : error,
    appendChild: (node) => { error = node; },
  };
  const document = {
    getElementById: (id) => id === 'familyLeadForm' ? form : { value: 'Chennai' },
    createElement: () => {
      const node = { className: '', textContent: '', setAttribute: () => {}, remove: () => { error = null; } };
      return node;
    },
  };
  const fetchImpl = async (_url, options) => {
    calls += 1;
    assert.equal(options.body.get('service'), 'Elder care');
    if (calls === 1) return new Promise((_resolve, reject) => { rejectFirst = reject; });
    return { ok: true };
  };
  initElderCareForm({
    document,
    fetchImpl,
    locationHref: 'https://preview.example/healthcare',
    formDataFactory: () => [['name', 'A'], ['email', 'a@b.co'], ['company', 'Family care enquiry'], ['service', 'Elder care']],
    setTimer: () => 1,
    clearTimer: () => {},
  });
  const event = { preventDefault: () => {} };
  const first = submit(event);
  await submit(event);
  assert.equal(calls, 1);
  rejectFirst(new Error('network'));
  await first;
  assert.equal(button.disabled, false);
  assert.match(error.textContent, /could not submit/i);

  await submit(event);
  assert.equal(calls, 2);
  assert.equal(error, null);
  assert.equal(form.style.display, 'none');
  assert.ok(successClasses.has('is-visible'));
  assert.equal(successFocused, true);
  assert.equal(attributes.has('aria-busy'), false);
});

test('family form aborts a stalled request and restores the submit button', async () => {
  let submit;
  let error = null;
  const button = { disabled: false, setAttribute: () => {}, removeAttribute: () => {} };
  const form = {
    action: '/api/lead', style: {}, parentElement: { querySelector: () => ({ classList: { add: () => {} }, focus: () => {} }) },
    addEventListener: (_name, handler) => { submit = handler; }, checkValidity: () => true, reportValidity: () => {},
    querySelector: (selector) => selector === 'button[type="submit"]' ? button : error,
    appendChild: (node) => { error = node; },
  };
  const document = {
    getElementById: (id) => id === 'familyLeadForm' ? form : { value: '' },
    createElement: () => ({ className: '', textContent: '', setAttribute: () => {}, remove: () => { error = null; } }),
  };
  initElderCareForm({
    document,
    fetchImpl: (_url, options) => new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(new Error('aborted')))),
    locationHref: 'https://preview.example/healthcare',
    formDataFactory: () => [['name', 'A'], ['email', 'a@b.co'], ['company', 'Family care enquiry'], ['service', 'Elder care']],
    setTimer: (callback) => { queueMicrotask(callback); return 1; },
    clearTimer: () => {},
  });
  await submit({ preventDefault: () => {} });
  assert.equal(button.disabled, false);
  assert.match(error.textContent, /could not submit/i);
});

test('plans page uses the same design system and current qualification language', async () => {
  const html = await page('plans-pricing');
  assertSharedShell(html, 'plans-pricing');
  assert.match(html, /Care Plus/);
  assert.match(html, /\$99/);
  assert.match(html, /Care Complete/);
  assert.match(html, /\$199/);
  assert.match(html, /confirm current pricing and service availability/i);
  assert.match(html, /href="\/healthcare#cta"/);
});

test('no-JavaScript enquiry pages state the booking boundary clearly', async () => {
  const success = await page('enquiry-thank-you');
  const failure = await page('enquiry-error');
  assert.match(success, /not an appointment confirmation/i);
  assert.match(failure, /No appointment has been booked/i);
  assert.match(success, /href="\/healthcare"/);
  assert.match(failure, /href="\/healthcare#cta"/);
});
