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

function visibleText(html) {
  return html
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;|&#39;|&apos;/gi, "'")
    .replace(/&rsquo;/gi, '’')
    .replace(/&amp;/gi, '&')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\s+([.,:;!?])/g, '$1')
    .trim();
}

function assertOrderedUniqueContent(text, blocks) {
  let cursor = 0;
  for (const block of blocks) {
    const index = text.indexOf(block, cursor);
    assert.notEqual(index, -1, `missing or out-of-order legacy content: ${block}`);
    assert.equal(text.split(block).length - 1, 1, `legacy content should appear once: ${block}`);
    cursor = index + block.length;
  }
}

test('elder-care page recreates the legacy healthcare content in the current design system', async () => {
  const html = await page('healthcare');
  assertSharedShell(html, 'healthcare');
  assert.match(html, /<title>Anara VIP Elderly Healthcare For Your Family in India<\/title>/);
  const legacyDescription = "With Anara, you'll have a trusted partner by your side, ready to handle all your family's healthcare needs with warmth, compassion, and expertise.";
  assert.match(html, new RegExp(`<meta name="description" content="${legacyDescription.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}">`));
  assert.match(html, /<meta property="og:title" content="Anara VIP Elderly Healthcare For Your Family in India">/);
  assert.match(html, /<meta name="twitter:title" content="Anara VIP Elderly Healthcare For Your Family in India">/);
  assert.match(html, /<meta name="twitter:description" content="With Anara,/);
  assert.match(html, /<meta name="twitter:image"/);

  const main = html.match(/<main\b[\s\S]*?<\/main>/i)?.[0] ?? '';
  const renderedContent = visibleText(main);
  const legacyContent = [
    'How Anara Health Can Ensure Your Parents Receive the Best Healthcare in India, While You Live Abroad.',
    "Partnered with India's Best healthcare ecosystem",
    'Rated 4.8/5 by our customers',
    'Second Opinions and Priority Access to top doctors',
    'Regular health check-ups and home visits',
    '24/7 support and emergency planning',
    'Detailed health updates sent to you',
    'Optional insurance packages available',
    "Here's Why Anara Is Your Family's Best Decision Yet",
    "Say goodbye to sleepless nights and endless phone calls. With Anara, you'll have a trusted partner by your side, ready to handle all your family's healthcare needs with warmth, compassion, and expertise.",
    'Partnered with top hospitals such as Apollo Hospitals, which has treated over 250 million people globally since 1983.',
    'Convenient Home Visits: Benefit from convenient home visits by doctors, nurses, physiotherapists, and other care providers.',
    '24/7 Support: Always have access to our dedicated support team, ready to assist with any healthcare needs.',
    'Priority Access to Top Doctors: Ensure timely and top-notch medical attention through our partnerships with top hospitals such as Apollo Hospitals.',
    'Regular Updates: Stay informed about your family’s health with frequent and detailed updates.',
    'Peace of Mind: Focus on your life abroad while we handle the healthcare logistics for your loved ones.',
    'Flexible Plans: Choose from flexible plans tailored to your needs and budget, with options for insurance coverage.',
    "Anara's groundbreaking partnership with Apollo Hospitals",
    'We understand that navigating the complexities of healthcare from a distance can be overwhelming. leaving you feeling helpless and anxious about the well-being of your loved ones back home.',
    'Our promise is to provide your loved ones with the same level of care and attention that you would if you were there yourself.',
    'With over 40 years of unparalleled service, Apollo Hospitals has set the benchmark for medical care in India.',
    'Since its founding in Chennai/Madras in 1983, Apollo Hospitals has treated 250 million people, from 120+ different countries.',
    "When it comes to your family's health, compromise is not an option.",
    'Choosing Anara will ensure your peace of mind, knowing that your loved ones are in the hands of trusted experts who prioritize their well-being above all else.',
    'We are here to create a positive impact and to make life easier for people who are facing these problems:',
    'At Anara Health, we truly understand the emotional and physical toll that healthcare challenges can take on your life:',
    "The frustration and uncertainty of being unable to access the best medical professionals for your family's healthcare needs.",
    'Feeling neglected and receiving care that fails to address your family’s specific needs and concerns effectively.',
    'The anxiety of not fully understanding the health status of your loved ones due to a lack of clear reports.',
    'Fear and confusion from uncertainty about where to seek trustworthy medical advice for your family.',
    "Disappointment with treatments that overlook your family's unique health requirements.",
    'Stress induced by the challenge of making informed health decisions without access to detailed information.',
    'The pressing need for peace of mind and a sense of security regarding your family’s health and well-being.',
    'The emotional burden of dealing with your family’s health issues, which adds to your existing worries and concerns.',
    "Here’s how Anara take the stress out of managing your family's health in India:",
    'We provide VIP access to top doctors, ensuring you receive care from highly qualified and renowned medical professionals.',
    'Our personalised healthcare approach tailors treatments and care plans specifically to your individual needs and concerns.',
    'We offer detailed and comprehensive health reports, giving you a clear and complete understanding of your health status.',
    'Our network of trusted and experienced doctors ensures you always have reliable and expert medical advice.',
    'We design treatments that are tailored to your unique health profile, ensuring the most effective care.',
    'Our comprehensive health insights provide you with the information needed to make informed and confident health decisions.',
    'We offer individualised health assessments to accurately address and manage your specific health conditions.',
    'Our compassionate care approach ensures you feel supported, reducing the emotional strain of managing health problems.',
    'Frequently Asked Questions',
    'What makes Anara Health different from other healthcare services?',
    'Anara Health offers a unique blend of comprehensive healthcare management, 24/7 support, and priority access to top doctors through our partnership with Apollo Hospitals. Our focus on personalised care and regular updates ensures transparency and peace of mind.',
    'What kind of updates will I receive?',
    'We provide detailed health updates regularly, including summaries of medical appointments, health check results, and any changes in your loved one’s condition.',
    'How can I be sure my family members will receive timely medical attention?',
    'Our priority access to top doctors and emergency planning ensures that your family member receives prompt and effective medical care whenever needed.',
    "What happens if there's an emergency?",
    'In case of an emergency, our team is prepared to coordinate immediate medical response and keep you informed throughout the process.',
  ];
  assertOrderedUniqueContent(renderedContent, legacyContent);
  assert.match(html, /player\.vimeo\.com\/video\/983565144/);
  assert.match(html, /id="how-it-works"/);
  assert.match(html, /id="how-anara-helps"/);
  assert.match(html, /id="faq"/);
  assert.match(html, /action="\/api\/lead"/);
  assert.match(html, /id="familyLeadForm"/);
  assert.doesNotMatch(html, /id="leadForm"/);
  assert.match(html, /name="service" value="Elder care"/);
  assert.match(html, /id="lf-city" name="city"/);
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
