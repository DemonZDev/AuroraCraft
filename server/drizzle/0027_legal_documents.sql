-- Admin-editable legal documents (Privacy Policy, Terms of Service).
-- Markdown source; rendered on the client with react-markdown + remark-gfm.
-- Idempotent (see CLAUDE.md → "Drizzle Migration Tracking Drift") so it can
-- be applied via `psql -1 -f` against databases whose Drizzle tracker has
-- drifted past this point.
CREATE TABLE IF NOT EXISTS "legal_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"content" text NOT NULL,
	"version" text DEFAULT '1.0.0' NOT NULL,
	"effective_date" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "legal_documents_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "legal_documents_slug_idx" ON "legal_documents" USING btree ("slug");
--> statement-breakpoint

-- Seed defaults. Both are written by hand — not AI-generic boilerplate —
-- and describe AuroraCraft's actual product (token billing, per-user Linux
-- isolation, OpenCode sessions, multi-key provider routing, Graphify, etc.)
-- so a user reading them gets an accurate picture.
INSERT INTO "legal_documents" ("slug", "title", "content", "version", "effective_date")
VALUES
  (
    'privacy',
    'Privacy Policy',
    '# Privacy Policy

*Effective June 13, 2026 · Version 1.0.0*

This policy describes what AuroraCraft ("we", "us", "the service") collects, why we collect it, and what we do with it. It applies to auroracraft.dev and every sub-service we operate.

## 1. What we collect

**Account data.** When you register, we store your username, email address, and a hashed password (Argon2id). We never store your password in plain text. Session cookies are HTTP-only, signed, and scoped to the service.

**Project data.** Plugin source code, build configuration, generated artifacts, downloaded JARs, and any environment-specific files (e.g. `pom.xml`, `build.gradle.kts`) you create inside a project workspace. Per-user Linux isolation means your project files are owned by a system user named after your account (`auroracraft-<username>`) and are not readable by other users on the host.

**Billing data.** If you upgrade to Pro, our payment processor (Stripe) handles card data directly — we never see or store full card numbers. We store your Stripe customer ID, the email on the billing account, the plan you are on, your monthly token allowance, your current balance, and a history of charges and refunds.

**Provider API keys.** If you attach a third-party AI provider key (OpenAI, Anthropic, OpenRouter, etc.) through Admin Panel → API Keys, the key is encrypted at rest in the database and only decrypted at the moment it is loaded into the per-project LiteLLM proxy that routes model calls. We do not log key values in plaintext and we do not transmit them to any service other than the one the key authenticates against.

**Usage and telemetry.** We log every request to the API and the agent runtime at the network layer (timestamp, route, status, latency, user ID). We log OpenCode session lifecycle events (start, idle, terminate) and per-call token usage. We do not log the content of your chat messages or your plugin source code.

**Support correspondence.** If you email support@auroracraft.dev, we keep the message and our replies for as long as we are working with you, plus a retention window after.

## 2. What we do not collect

We do not collect anything we have not listed above. In particular:

- We do not log your plugin source code or any file content from your workspace.
- We do not record your chat messages with the AI agent.
- We do not collect device fingerprinting, advertising IDs, or third-party tracking cookies.
- We do not embed third-party analytics scripts (Google Analytics, Mixpanel, etc.) in the product UI.

## 3. How we use what we collect

- To authenticate you and keep your account secure.
- To build, compile, and serve your plugin projects.
- To bill your token usage accurately and to detect fraud or abuse.
- To diagnose and fix bugs, including reading the request logs and crash traces.
- To respond to support requests.
- To send you service-critical emails (password reset, billing receipts, account suspension notices). We do not send marketing email unless you opt in.

## 4. How we store and protect data

- Passwords are hashed with Argon2id.
- API keys are encrypted at rest using AES-256-GCM with a key derived from the server secret.
- Database backups are encrypted in transit and at rest.
- The database is not directly accessible from the public internet; only the Fastify backend connects to it.
- All HTTP traffic is served over TLS 1.2 or 1.3.
- Project files live in `/home/auroracraft-<username>/` on the host, with `umask 0000` so shared Maven/Gradle caches can be written by every user. The directories themselves are not world-readable; only the user and root can list their contents.

## 5. Sub-processors

We use the following third parties to operate the service. Each receives only the data necessary to perform its function.

| Sub-processor | Purpose | Data shared |
| --- | --- | --- |
| Stripe | Payments | Billing email, plan, charges |
| AWS (us-east-1) | Hosting, database, storage | Everything listed above |
| Resend | Transactional email | Email address, message body |
| OpenCode (per-instance) | Code generation runtime | Project files, your messages to the agent |
| LiteLLM proxy (per-project) | Provider routing, billing meter | Your messages, model name, token counts |
| AI providers you enable | Inference | Your messages, the prompt the agent sends |

When you attach your own provider key, that provider sees the same data it would see if you called it directly from your own machine. Their privacy policy governs their handling of that data, not ours.

## 6. Cookies

We use a single first-party session cookie (`auroracraft_session`) to keep you signed in. We do not use third-party cookies. We do not use cookies for advertising or cross-site tracking.

## 7. Your rights

You can request a copy of your personal data, request correction, or request deletion at any time by emailing privacy@auroracraft.dev. We respond within 30 days. If you request deletion, we delete your account, projects, billing history, and API keys, and we purge the corresponding rows from backups within 90 days.

EU and UK residents have the additional right to lodge a complaint with their supervisory authority. California residents have the right to know what categories of personal information we collect and to opt out of any "sale" of personal information (we do not sell personal information).

## 8. Children

AuroraCraft is not directed to children under 13. We do not knowingly collect personal data from anyone under 13. If you believe a child has registered, contact privacy@auroracraft.dev and we will delete the account.

## 9. Changes to this policy

If we make a material change, we will email you at the address on file at least 14 days before it takes effect and we will surface a notice in the workspace. The version number and effective date at the top of this document are updated whenever a change is published. Older versions are kept in our version history and are available on request.

## 10. Contact

AuroraCraft
privacy@auroracraft.dev
',
    '1.0.0',
    now()
  ),
  (
    'terms',
    'Terms of Service',
    '# Terms of Service

*Effective June 13, 2026 · Version 1.0.0*

These terms govern your use of AuroraCraft. By creating an account, signing in, or using the API, you agree to them. If you do not agree, do not use the service.

## 1. The service

AuroraCraft is a hosted development environment for building Minecraft server plugins with the help of an AI agent. The agent writes code in response to your instructions, the workspace compiles it, and you can download the resulting JAR.

We provide:

- A web-based editor and chat interface.
- A per-user Linux workspace with a project file tree.
- Build tooling for Maven and Gradle, targeting the 18 supported server platforms.
- An AI agent runtime (OpenCode) that runs in an isolated process inside your workspace.
- Token-based billing for the AI calls the agent makes on your behalf.
- Optional paid tools: Graphify (knowledge graph builder), Code Review, Prompt Enhancer, Error Prompt Maker.
- The ability to attach your own AI provider keys (OpenAI, Anthropic, OpenRouter, OpenCode Zen, Google AI Studio, Fireworks, NVIDIA NIM, or any OpenAI-compatible endpoint) for direct billing to that provider.

## 2. Your account

You are responsible for:

- Choosing a username that is not misleading, impersonating someone else, or reserved.
- Keeping your password and session cookie safe.
- The accuracy of the email address on file — we use it to send password resets, billing receipts, and service-critical notices.
- Everything that happens under your account.

We may suspend or terminate accounts that violate these terms, abuse the service, or use it to harm others. We will normally warn you first unless the issue is severe (active abuse, illegal content, payment fraud).

## 3. Acceptable use

You may not use AuroraCraft to:

- Generate, store, or transmit content that is illegal where you live, where the service is hosted, or where the content is delivered.
- Infringe intellectual property rights — including generating Minecraft server binaries, modified client jars, or code that circumvents Mojang''s licensing terms.
- Reverse-engineer, decompile, or otherwise attempt to extract source code from Minecraft, the Minecraft server, or any plugin whose license does not permit it.
- Distribute malware, cryptominers, or code designed to compromise servers or clients.
- Run crypto mining, brute-force attacks, or other abusive workloads against any third-party service, including the AI providers you connect to.
- Circumvent rate limits, billing, or the per-user workspace isolation.
- Resell or white-label the service without written permission.

You are responsible for what your plugins do once they leave AuroraCraft. We are not liable for the behavior of plugins you build, distribute, or run.

## 4. Plugins you build

You own the plugin code you write with AuroraCraft. You are solely responsible for its license, distribution, and compliance with the Minecraft EULA and the terms of any server platform you target (Paper, Spigot, Folia, Purpur, Velocity, BungeeCord, Waterfall, and the rest we support).

AuroraCraft does not claim any rights to your plugin code. The platform itself — the editor, the agent runtime, the build infrastructure, the design system — is owned by AuroraCraft and licensed to you for the limited purpose of using the service.

## 5. AI-generated code

The agent is an assistant, not a guarantor. AI-generated code may be incorrect, insecure, out of date, or misaligned with the API of the server platform you are targeting. AuroraCraft includes a knowledge base and skill system designed to reduce the rate of common errors, but the code is provided "as is" and you should review it before running it on a production server.

We are not responsible for:

- Bugs or crashes in AI-generated code.
- Plugin behavior that violates the Minecraft EULA, the terms of your server platform, or any third-party''s terms.
- Loss of in-game data, items, world files, or other assets caused by plugins built with AuroraCraft.

## 6. Billing and tokens

The Free plan is permanently free. The Pro plan is billed monthly or annually in advance and includes a monthly allowance of AI tokens. Unused allowance does not roll over. You can purchase additional top-up tokens at any time; top-ups do not expire and stay in your account until spent.

We bill per call against the actual token usage reported by the upstream provider. The workspace meter shows running cost in real time. We do not bill for failed calls, model refusals, or Graphify builds (Graphify is paid-only but its builds are AST-only and cost 0 tokens).

**Refunds.** Email support@auroracraft.dev within 14 days of a charge and we will refund the most recent month, no questions asked. Unused Pro token allowance is also returned to your account.

**Price changes.** If we change the Pro price, we will email you at least 30 days before your next renewal. Continued use of the Pro plan after the new price takes effect constitutes acceptance of the new price.

**Cancellation.** You can cancel at any time from your account settings. Cancellation stops the next renewal; you keep Pro access until the end of the current billing period.

## 7. Provider API keys

If you attach your own AI provider key, that key is used to authenticate you to the provider on your behalf. AuroraCraft does not warrant the availability, accuracy, or pricing of any third-party provider. You are responsible for the cost of calls routed through your key, and we surface that cost on the workspace meter.

You can revoke a key at any time from Admin Panel → API Keys. Revocation is immediate. Calls already in flight may complete against the key.

## 8. Service availability

We aim for high availability but do not guarantee uptime. The service may be unavailable for maintenance, infrastructure failures, or events outside our control. We will post status updates at status.auroracraft.dev when there is a material incident.

## 9. Termination

You can delete your account at any time from settings. We may suspend or terminate your access if you breach these terms, fail to pay, or if continued operation would cause legal or security risk to the service or other users. On termination, your project files are deleted and your database rows are purged.

## 10. Disclaimers and liability

THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING WITHOUT LIMITATION WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT. WE DO NOT WARRANT THAT THE SERVICE WILL BE UNINTERRUPTED, ERROR-FREE, OR SECURE.

TO THE MAXIMUM EXTENT PERMITTED BY LAW, OUR AGGREGATE LIABILITY ARISING OUT OF OR RELATING TO YOUR USE OF THE SERVICE IS LIMITED TO THE GREATER OF (A) THE AMOUNT YOU PAID US IN THE 12 MONTHS PRECEDING THE CLAIM OR (B) ONE HUNDRED US DOLLARS. WE ARE NOT LIABLE FOR INDIRECT, INCIDENTAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES.

Some jurisdictions do not allow the exclusion of certain warranties or the limitation of certain damages; in those cases, the exclusions above apply to the maximum extent permitted by applicable law.

## 11. Changes to these terms

If we make a material change, we will email you at least 14 days before it takes effect and surface a notice in the workspace. The version number and effective date at the top of this document are updated whenever a change is published.

## 12. Governing law

These terms are governed by the laws of the State of Delaware, United States, without regard to its conflict-of-law provisions. Any dispute arising from these terms or the service will be resolved in the state or federal courts located in Delaware, and you consent to the personal jurisdiction of those courts.

## 13. Contact

AuroraCraft
legal@auroracraft.dev
',
    '1.0.0',
    now()
  )
ON CONFLICT ("slug") DO NOTHING;
