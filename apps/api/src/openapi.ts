/** Minimal OpenAPI document used by `pnpm --filter api openapi`. */
export const openApiDocument = {
  openapi: '3.0.3',
  info: {
    title: 'SIC Live API',
    version: '0.0.1',
    description: 'Generated stub for overnight build; regenerate with pnpm --filter api openapi.',
  },
  paths: {
    '/api/health': { get: { summary: 'Health', responses: { '200': { description: 'OK' } } } },
    '/api/me': { get: { summary: 'Current user', responses: { '200': { description: 'Me' } } } },
    '/api/sites': {
      get: { summary: 'Sites the caller can see', responses: { '200': { description: 'Site list' } } },
    },
    '/api/sites/{site}/sic': {
      get: {
        summary: 'SIC hours for a day',
        parameters: [
          { in: 'path', name: 'site', required: true, schema: { type: 'string' } },
          { in: 'query', name: 'day', schema: { type: 'string' } },
          { in: 'query', name: 'line', schema: { type: 'integer' } },
        ],
        responses: {
          '200': { description: 'Hours and summary' },
          '304': { description: 'Not modified' },
        },
      },
    },
    '/api/sites/{site}/sic/version': {
      get: {
        summary: 'SIC freshness',
        parameters: [{ in: 'path', name: 'site', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Version' } },
      },
    },
    '/api/tv/{key}/sic': {
      get: {
        summary: 'Floor TV SIC read',
        parameters: [{ in: 'path', name: 'key', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Hours without names' } },
      },
    },
    '/api/actions': {
      get: { summary: 'List actions', responses: { '200': { description: 'Paged actions' } } },
      post: { summary: 'Create action', responses: { '200': { description: 'Created' } } },
    },
    '/api/inbox': {
      get: { summary: 'Manager inbox', responses: { '200': { description: 'Notices' } } },
    },
  },
};
