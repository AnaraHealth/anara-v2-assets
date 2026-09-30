'use strict';
const { app } = require('@azure/functions');
const { handleLead, makeSender } = require('../lead-handler');

app.http('lead', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'lead',
  handler: async (request, context) => {
    const headers = {};
    for (const [k, v] of request.headers) headers[k.toLowerCase()] = v;
    const rawText = await request.text();
    const sendMail = makeSender(process.env);
    const result = await handleLead({ method: request.method, headers, rawText }, process.env, sendMail);
    if (result.error) context.error('lead delivery failed', result.error.message); // no lead content in logs
    if (result.redirect) return { status: result.status, headers: { Location: result.redirect } };
    return { status: result.status, jsonBody: result.json };
  },
});
