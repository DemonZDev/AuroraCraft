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
import * as projectLikes from './schema/project-likes.js'
import * as projectViews from './schema/project-views.js'
import * as promptToolJobs from './schema/prompt-tool-jobs.js'
import * as aiProviders from './schema/ai-providers.js'
import * as aiModels from './schema/ai-models.js'
import * as mcps from './schema/mcps.js'
import * as planSettings from './schema/plan-settings.js'

const client = postgres(env.DATABASE_URL)

export const db = drizzle(client, {
  schema: { ...users, ...sessions, ...projects, ...agentSessions, ...agentMessages, ...agentLogs, ...codeReviews, ...providerApiKeys, ...projectLikes, ...projectViews, ...promptToolJobs, ...aiProviders, ...aiModels, ...mcps, ...planSettings },
})

export type Database = typeof db
