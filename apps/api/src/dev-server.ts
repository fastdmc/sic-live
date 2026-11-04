import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { createApp } from './app.js';
import { loadConfig } from './config.js';

const config = loadConfig();
const app = createApp({ config });

async function readBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  if (chunks.length === 0) return undefined;
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) return undefined;
  const ct = req.headers['content-type'] ?? '';
  if (ct.includes('application/json')) return JSON.parse(raw);
  return raw;
}

function remoteAddress(req: IncomingMessage): string | undefined {
  const ra = req.socket.remoteAddress;
  return ra ?? undefined;
}

const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
  try {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    const query: Record<string, string | undefined> = {};
    url.searchParams.forEach((v, k) => {
      query[k] = v;
    });
    const headers: Record<string, string | undefined> = {};
    for (const [k, v] of Object.entries(req.headers)) {
      headers[k] = Array.isArray(v) ? v[0] : v;
    }
    const body = ['POST', 'PUT', 'PATCH'].includes((req.method ?? 'GET').toUpperCase())
      ? await readBody(req)
      : undefined;
    const result = await app.handle({
      method: req.method ?? 'GET',
      path: url.pathname,
      headers,
      query,
      body,
      remoteAddress: remoteAddress(req),
    });
    for (const [k, v] of Object.entries(result.headers ?? {})) res.setHeader(k, v);
    res.statusCode = result.status;
    if (result.body === undefined) res.end();
    else {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(result.body));
    }
  } catch (err) {
    console.error(err);
    res.statusCode = 500;
    res.end(JSON.stringify({ error: { message: 'Server error' } }));
  }
});

server.listen(config.port, '127.0.0.1', () => {
  console.log(`SIC API listening on http://127.0.0.1:${config.port} (${config.dataMode}/${config.authMode})`);
});
