'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { handleLead, parseBody, originAllowed, makeSendGridSender, makeAcsSender, makeSender } = require('../src/lead-handler');

const env = { LEAD_TO: 'sales@example.test', LEAD_FROM: 'website@example.test' };
const form = (o) => new URLSearchParams(o).toString();
const req = (rawText, extra = {}) => ({
  method: 'POST',
  headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json', origin: 'https://www.anara.health', ...extra },
  rawText,
});

test('valid lead sends one email and returns code 200', async () => {
  const sent = [];
  const r = await handleLead(req(form({ name: 'A', email: 'a@b.co', company: 'Acme', employees: '50-200', service: 'Elder care' })), env, async (m) => sent.push(m));
  assert.equal(r.status, 200); assert.equal(r.json.code, 200);
  assert.equal(sent.length, 1); assert.equal(sent[0].to, 'sales@example.test'); assert.equal(sent[0].replyTo, 'a@b.co');
  assert.match(sent[0].subject, /Acme/);
  assert.match(sent[0].text, /Service: Elder care/);
});

test('honeypot filled: pretends success, sends nothing', async () => {
  const sent = [];
  const r = await handleLead(req(form({ name: 'A', email: 'a@b.co', company: 'Acme', _gotcha: 'x' })), env, async (m) => sent.push(m));
  assert.equal(r.status, 200); assert.equal(sent.length, 0);
});

test('missing/invalid fields -> 400 with field list', async () => {
  const r = await handleLead(req(form({ name: '', email: 'nope', company: 'Acme' })), env, async () => {});
  assert.equal(r.status, 400); assert.deepEqual(r.json.fields, ['name', 'email']);
});

test('foreign origin rejected', async () => {
  const r = await handleLead(req(form({ name: 'A', email: 'a@b.co', company: 'Acme' }), { origin: 'https://evil.example' }), env, async () => {});
  assert.equal(r.status, 403);
});

test('no-JS fallback (no Accept json) redirects to thank-you', async () => {
  const r = await handleLead(req(form({ name: 'A', email: 'a@b.co', company: 'Acme' }), { accept: 'text/html' }), env, async () => {});
  assert.equal(r.status, 303); assert.equal(r.redirect, '/enquiry-thank-you');
});

test('no-JS validation and delivery failures redirect to a usable error page', async () => {
  const invalid = await handleLead(req(form({ name: '', email: 'nope', company: 'Acme' }), { accept: 'text/html' }), env, async () => {});
  assert.equal(invalid.status, 303); assert.equal(invalid.redirect, '/enquiry-error?code=400');
  const failed = await handleLead(req(form({ name: 'A', email: 'a@b.co', company: 'Acme' }), { accept: 'text/html' }), env, async () => { throw new Error('boom'); });
  assert.equal(failed.status, 303); assert.equal(failed.redirect, '/enquiry-error?code=502');
});

test('mail failure -> 502 with friendly message', async () => {
  const r = await handleLead(req(form({ name: 'A', email: 'a@b.co', company: 'Acme' })), env, async () => { throw new Error('boom'); });
  assert.equal(r.status, 502); assert.match(r.json.msg, /sales@anara.health/);
});

test('json body and header injection are handled', async () => {
  const sent = [];
  const r = await handleLead({ method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' }, rawText: JSON.stringify({ name: 'A\r\nBcc: x', email: 'a@b.co', company: '<b>Acme</b>' }) }, env, async (m) => sent.push(m));
  assert.equal(r.status, 200); assert.ok(!sent[0].text.includes('\r')); assert.ok(sent[0].html.includes('&lt;b&gt;'));
});

test('parseBody / originAllowed helpers', () => {
  assert.deepEqual(parseBody('application/json', '{"a":1}'), { a: 1 });
  assert.deepEqual(parseBody('application/x-www-form-urlencoded', 'a=1&b=x'), { a: '1', b: 'x' });
  assert.equal(originAllowed('', ['https://x']), true);
  assert.equal(originAllowed('https://y', ['https://x']), false);
});

test('ACS sender maps fields and requires Succeeded status', async () => {
  const calls = [];
  const fakeClient = { beginSend: async (msg) => { calls.push(msg); return { pollUntilDone: async () => ({ status: 'Succeeded' }) }; } };
  const send = makeAcsSender('endpoint=https://x;accesskey=y', 'DoNotReply@x.azurecomm.net', () => fakeClient);
  await send({ to: 'a@b.co, c@d.co', from: 'ignored@x', replyTo: 'lead@x.co', subject: 'S', text: 'T', html: '<p>H</p>' });
  assert.equal(calls[0].senderAddress, 'DoNotReply@x.azurecomm.net');
  assert.deepEqual(calls[0].recipients.to.map((r) => r.address), ['a@b.co', 'c@d.co']);
  assert.equal(calls[0].replyTo[0].address, 'lead@x.co');
  const failing = { beginSend: async () => ({ pollUntilDone: async () => ({ status: 'Failed' }) }) };
  await assert.rejects(makeAcsSender('cs', 's@x', () => failing)({ to: 'a@b.co', from: 'f', replyTo: 'r@x.co', subject: 's', text: 't', html: 'h' }));
});

test('SendGrid sender maps fields and rejects non-success responses', async () => {
  const calls = [];
  const send = makeSendGridSender('key', async (url, options) => {
    calls.push({ url, options });
    return { ok: true, status: 202 };
  });
  await send({ to: 'a@b.co, c@d.co', from: 'from@x.co', replyTo: 'lead@x.co', subject: 'S', text: 'T', html: '<p>H</p>' });
  assert.equal(calls[0].url, 'https://api.sendgrid.com/v3/mail/send');
  assert.equal(calls[0].options.headers.Authorization, 'Bearer key');
  const body = JSON.parse(calls[0].options.body);
  assert.deepEqual(body.personalizations[0].to.map((item) => item.email), ['a@b.co', 'c@d.co']);
  assert.equal(body.reply_to.email, 'lead@x.co');
  await assert.rejects(makeSendGridSender('key', async () => ({ ok: false, status: 429 }))({ to: 'a@b.co', from: 'f@x.co', replyTo: 'r@x.co', subject: 's', text: 't', html: 'h' }), /429/);
});

test('makeSender prefers ACS when configured', () => {
  assert.equal(typeof makeSender({ ACS_EMAIL_CONNECTION_STRING: 'cs' }), 'function');
  assert.equal(typeof makeSender({ SENDGRID_API_KEY: 'k' }), 'function');
});
