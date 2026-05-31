import 'dotenv/config'
import { z } from 'zod'

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  PORT: z.coerce.number().default(3000),
  HOST: z.string().default('0.0.0.0'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  SESSION_SECRET: z.string().min(16),
  COOKIE_DOMAIN: z.string().default('localhost'),
  COOKIE_SECURE: z.enum(['true', 'false', 'auto']).default('auto'),
  CLIENT_URL: z.string().url().default('http://localhost:5173'),
  OPENCODE_PORT_MIN: z.coerce.number().default(9000),
  OPENCODE_PORT_MAX: z.coerce.number().default(9999),
  OPENCODE_IDLE_TIMEOUT: z.coerce.number().default(120000),
  LITELLM_PORT_MIN: z.coerce.number().default(8000),
  LITELLM_PORT_MAX: z.coerce.number().default(8999),
  LITELLM_IDLE_TIMEOUT: z.coerce.number().default(120000),
  GITHUB_CLIENT_ID: z.string().optional(),
  GITHUB_CLIENT_SECRET: z.string().optional(),
  GITHUB_CALLBACK_URL: z.string().url().optional(),
})

export const env = envSchema.parse(process.env)
