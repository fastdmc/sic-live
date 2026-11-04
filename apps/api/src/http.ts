import { randomUUID } from 'node:crypto';
import { ZodError, type ZodTypeAny } from 'zod';
import { SicError } from '@sic/shared';
import { AuthError } from './auth/errors.js';

export type HttpRequest = {
  method: string;
  path: string;
  headers: Record<string, string | undefined>;
  query: Record<string, string | undefined>;
  body?: unknown;
  remoteAddress?: string;
};

export type HttpResponse = {
  status: number;
  body?: unknown;
  headers?: Record<string, string>;
};

export type RouteHandler = (
  req: HttpRequest,
  params: Record<string, string>,
) => Promise<HttpResponse> | HttpResponse;

type Route = {
  method: string;
  pattern: RegExp;
  keys: string[];
  template: string;
  handler: RouteHandler;
};

function compile(path: string): { pattern: RegExp; keys: string[] } {
  const keys: string[] = [];
  const parts = path.split('/').map((part) => {
    if (part.startsWith(':')) {
      keys.push(part.slice(1));
      return '([^/]+)';
    }
    if (part === '*') {
      keys.push('wildcard');
      return '(.*)';
    }
    return part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  });
  return { pattern: new RegExp(`^${parts.join('/')}$`), keys };
}

export class Router {
  private routes: Route[] = [];

  route(method: string, path: string, handler: RouteHandler): this {
    const { pattern, keys } = compile(path);
    this.routes.push({
      method: method.toUpperCase(),
      pattern,
      keys,
      template: path,
      handler,
    });
    return this;
  }

  async handle(req: HttpRequest): Promise<HttpResponse & { routeTemplate?: string }> {
    const method = req.method.toUpperCase();
    const path = req.path.replace(/\/+$/, '') || '/';
    for (const route of this.routes) {
      if (route.method !== method && route.method !== 'ALL') continue;
      const m = path.match(route.pattern);
      if (!m) continue;
      const params: Record<string, string> = {};
      route.keys.forEach((k, i) => {
        params[k] = decodeURIComponent(m[i + 1] ?? '');
      });
      try {
        const res = await route.handler(req, params);
        return { ...res, routeTemplate: route.template };
      } catch (err) {
        return { ...mapError(err), routeTemplate: route.template };
      }
    }
    return { status: 404, body: { error: { message: 'Not found' } }, routeTemplate: undefined };
  }
}

export function mapError(err: unknown): HttpResponse {
  if (err instanceof AuthError) {
    return { status: err.status, body: { error: { message: err.message } } };
  }
  if (err instanceof SicError) {
    return {
      status: err.status,
      body: { error: { code: err.code, message: err.message } },
    };
  }
  if (err instanceof ZodError) {
    return {
      status: 400,
      body: {
        error: {
          message: 'Invalid request',
          fields: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
        },
      },
    };
  }
  const correlationId = randomUUID();
  console.error(`[${correlationId}]`, err);
  return {
    status: 500,
    body: { error: { correlationId, message: 'Something went wrong' } },
  };
}

export function parseJsonBody<T extends ZodTypeAny>(schema: T, body: unknown): T['_output'] {
  return schema.parse(body ?? {});
}

export function securityHeaders(): Record<string, string> {
  return {
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Cache-Control': 'no-store',
  };
}

export function isLocalAddress(addr?: string | null): boolean {
  if (!addr) return false;
  const a = addr.replace(/^::ffff:/, '');
  return a === '127.0.0.1' || a === '::1' || addr === '::ffff:127.0.0.1';
}
