import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import { env } from '../env.js'
import * as users from './schema/users.js'
import * as sessions from './schema/sessions.js'
import * as projects from './schema/projects.js'
import * as agentSessions from './schema/agent-sessions.js'
import * as agentMessages from './schema/agent-messages.js'
import * as agentLogs from './schema/agent-logs.js'
import * as codeReviews from './schema/code-reviews.js'
import * as providerApiKeys from './schema/provider-api-keys.js'

const client = postgres(env.DATABASE_URL)

export const db = drizzle(client, {
  schema: { ...users, ...sessions, ...projects, ...agentSessions, ...agentMessages, ...agentLogs, ...codeReviews, ...providerApiKeys },
})

export type Database = typeof db
