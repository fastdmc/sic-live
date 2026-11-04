import { z } from 'zod';

const ConfigSchema = z.object({
  dataMode: z.enum(['fake', 'sql']).default('fake'),
  authMode: z.enum(['dev', 'entra']).default('dev'),
  allowedTenantIds: z.array(z.string()).default([]),
  apiAudience: z.string().optional(),
  corsOrigins: z.array(z.string()).default(['http://localhost:5173']),
  sqlServer: z.string().optional(),
  sqlDatabase: z.string().optional(),
  azureClientId: z.string().optional(),
  appBaseUrl: z.string().default('http://localhost:5173'),
  port: z.number().default(7071),
});

export type AppConfig = z.infer<typeof ConfigSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const raw = {
    dataMode: env.SIC_DATA_MODE ?? 'fake',
    authMode: env.SIC_AUTH_MODE ?? 'dev',
    allowedTenantIds: (env.SIC_ALLOWED_TENANT_IDS ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    apiAudience: env.SIC_API_AUDIENCE || undefined,
    corsOrigins: (env.SIC_CORS_ORIGINS ?? 'http://localhost:5173')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    sqlServer: env.SIC_SQL_SERVER || undefined,
    sqlDatabase: env.SIC_SQL_DATABASE || undefined,
    azureClientId: env.AZURE_CLIENT_ID || undefined,
    appBaseUrl: env.SIC_APP_BASE_URL ?? 'http://localhost:5173',
    port: Number(env.PORT ?? 7071),
  };

  const parsed = ConfigSchema.safeParse(raw);
  if (!parsed.success) {
    const missing = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
    throw new Error(`Invalid configuration:\n${missing.join('\n')}`);
  }

  const cfg = parsed.data;
  if (cfg.authMode === 'entra') {
    const need: string[] = [];
    if (!cfg.apiAudience) need.push('SIC_API_AUDIENCE');
    if (cfg.allowedTenantIds.length === 0) need.push('SIC_ALLOWED_TENANT_IDS');
    if (need.length) throw new Error(`Missing settings for entra mode: ${need.join(', ')}`);
  }
  if (cfg.dataMode === 'sql') {
    const need: string[] = [];
    if (!cfg.sqlServer) need.push('SIC_SQL_SERVER');
    if (!cfg.sqlDatabase) need.push('SIC_SQL_DATABASE');
    if (need.length) throw new Error(`Missing settings for sql mode: ${need.join(', ')}`);
  }
  return cfg;
}
