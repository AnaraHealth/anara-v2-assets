'use strict';

// Pure request handler for the public lead form. Kept free of the Azure
// Functions runtime so it can be unit-tested with plain Node.

const MAX = { name: 120, email: 200, company: 160, phone: 40, employees: 40, service: 80, page: 500 };
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function clean(value, limit) {
  if (typeof value !== 'string') return '';
  return value.replace(/[\r\n\t]+/g, ' ').trim().slice(0, limit);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function parseBody(contentType, rawText) {
  const ct = (contentType || '').toLowerCase();
  if (ct.includes('application/json')) {
    try { return JSON.parse(rawText || '{}') || {}; } catch { return {}; }
  }
  const params = new URLSearchParams(rawText || '');
  const out = {};
  for (const [k, v] of params) out[k] = v;
  return out;
}

function originAllowed(origin, allowed) {
  if (!origin) return true; // same-origin form posts and no-JS fallback carry no Origin header
  return allowed.some((a) => origin === a);
}

async function handleLead({ method, headers, rawText }, env, sendMail) {
  const get = (k) => headers[k] || headers[k.toLowerCase()] || '';
  if (method !== 'POST') return { status: 405, json: { code: 405, msg: 'Method not allowed' } };
  const wantsJson = (get('accept') || '').includes('application/json');
  const errorResponse = (status, json) => wantsJson
    ? { status, json }
    : { status: 303, redirect: `/enquiry-error?code=${status}` };

  const allowedOrigins = (env.ALLOWED_ORIGINS || 'https://www.anara.health,https://anara.health')
    .split(',').map((s) => s.trim()).filter(Boolean);
  if (!originAllowed(get('origin'), allowedOrigins)) {
    return errorResponse(403, { code: 403, msg: 'Origin not allowed' });
  }

  const body = parseBody(get('content-type'), rawText);

  // Honeypot: bots fill hidden fields. Pretend success so they stop retrying.
  if (clean(body._gotcha, 50)) {
    return wantsJson ? { status: 200, json: { code: 200, msg: 'ok' } } : { status: 303, redirect: '/enquiry-thank-you' };
  }

  const lead = {
    name: clean(body.name, MAX.name),
    email: clean(body.email, MAX.email),
    company: clean(body.company, MAX.company),
    phone: clean(body.phone, MAX.phone),
    employees: clean(body.employees, MAX.employees),
    service: clean(body.service, MAX.service),
    page: clean(body.page, MAX.page),
  };
  const errors = [];
  if (!lead.name) errors.push('name');
  if (!lead.email || !EMAIL_RE.test(lead.email)) errors.push('email');
  if (!lead.company) errors.push('company');
  if (errors.length) {
    return errorResponse(400, { code: 400, msg: 'Missing or invalid fields', fields: errors });
  }

  const to = env.LEAD_TO || 'Sales@anara.health';
  const from = env.LEAD_FROM || 'website@anara.health';
  const subject = `New lead from anara.health: ${lead.company}`;
  const lines = [
    ['Name', lead.name], ['Work email', lead.email], ['Company', lead.company],
    ['Phone', lead.phone || '-'], ['Service', lead.service || '-'], ['Employees', lead.employees || '-'], ['Page', lead.page || '-'],
    ['Received', new Date().toISOString()],
  ];
  const text = lines.map(([k, v]) => `${k}: ${v}`).join('\n');
  const html = `<table cellpadding="6" style="font-family:Arial,sans-serif;font-size:14px">${lines
    .map(([k, v]) => `<tr><td style="color:#555"><b>${escapeHtml(k)}</b></td><td>${escapeHtml(v)}</td></tr>`).join('')}</table>`;

  try {
    await sendMail({ to, from, replyTo: lead.email, subject, text, html });
  } catch (err) {
    const response = errorResponse(502, { code: 502, msg: 'Could not deliver your request. Please email sales@anara.health.' });
    return { ...response, error: err };
  }
  return wantsJson ? { status: 200, json: { code: 200, msg: 'ok' } } : { status: 303, redirect: '/enquiry-thank-you' };
}

// SendGrid v3 mail/send via fetch. Returns nothing on success, throws on failure.
function makeSendGridSender(apiKey, fetchImpl = fetch) {
  return async ({ to, from, replyTo, subject, text, html }) => {
    if (!apiKey) throw new Error('SENDGRID_API_KEY not configured');
    const res = await fetchImpl('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        personalizations: [{ to: to.split(',').map((e) => ({ email: e.trim() })) }],
        from: { email: from, name: 'Anara Health website' },
        reply_to: { email: replyTo },
        subject,
        content: [{ type: 'text/plain', value: text }, { type: 'text/html', value: html }],
        tracking_settings: { click_tracking: { enable: false }, open_tracking: { enable: false } },
      }),
    });
    if (!res.ok) throw new Error(`SendGrid responded ${res.status}`);
  };
}


// Azure Communication Services Email. Returns nothing on success, throws on failure.
function makeAcsSender(connectionString, senderAddress, clientFactory) {
  return async ({ to, from, replyTo, subject, text, html }) => {
    if (!connectionString) throw new Error('ACS_EMAIL_CONNECTION_STRING not configured');
    const { EmailClient } = require('@azure/communication-email');
    const client = clientFactory ? clientFactory(connectionString) : new EmailClient(connectionString);
    const poller = await client.beginSend({
      senderAddress: senderAddress || from,
      recipients: { to: to.split(',').map((e) => ({ address: e.trim() })) },
      replyTo: [{ address: replyTo }],
      content: { subject, plainText: text, html },
      userEngagementTrackingDisabled: true,
    });
    const result = await poller.pollUntilDone();
    if (!result || result.status !== 'Succeeded') throw new Error(`ACS email status ${result && result.status}`);
  };
}

// Pick the configured provider: ACS when its connection string is present, otherwise SendGrid.
function makeSender(env, fetchImpl) {
  if (env.ACS_EMAIL_CONNECTION_STRING) return makeAcsSender(env.ACS_EMAIL_CONNECTION_STRING, env.ACS_SENDER_ADDRESS);
  return makeSendGridSender(env.SENDGRID_API_KEY, fetchImpl);
}

module.exports = { handleLead, makeSendGridSender, makeAcsSender, makeSender, parseBody, originAllowed };
