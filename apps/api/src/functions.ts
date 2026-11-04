/**
 * Azure Functions v4 HTTP adapter. Overnight tests use the Node dev server;
 * this module is the production entry the Function App loads.
 */
import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from '@azure/functions';
import { createApp } from './app.js';

const api = createApp();

async function handler(request: HttpRequest, _context: InvocationContext): Promise<HttpResponseInit> {
  const headers: Record<string, string | undefined> = {};
  request.headers.forEach((v, k) => {
    headers[k] = v;
  });
  const query: Record<string, string | undefined> = {};
  request.query.forEach((v, k) => {
    query[k] = v;
  });
  let body: unknown;
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    try {
      body = await request.json();
    } catch {
      body = undefined;
    }
  }
  const path = `/api/${request.params.path ?? ''}`.replace(/\/+$/, '') || '/api';
  const result = await api.handle({
    method: request.method,
    path,
    headers,
    query,
    body,
    remoteAddress: '127.0.0.1',
  });
  return {
    status: result.status,
    headers: result.headers,
    jsonBody: result.body as Record<string, unknown>,
  };
}

app.http('api', {
  route: '{*path}',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  authLevel: 'anonymous',
  handler,
});
