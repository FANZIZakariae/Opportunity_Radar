# Opportunity Radar

Opportunity Radar is a local intelligence workspace for finding companies that are likely to need AI, automation, document intelligence, RAG, or workflow engineering help before the opportunity is obvious to everyone else.

Instead of acting like a generic lead list, it turns public evidence into usable business-development cards:

- what the company appears to need;
- why that need is credible;
- who might be the right public contact;
- how strong the evidence is;
- what short outreach angle you can send next.

The result is a practical radar for freelancers, consultants, and AI builders who want to detect signals early, qualify them carefully, and contact people with something sharper than a cold generic pitch.

## Why this project exists

Most prospecting workflows break in one of two ways:

- they are fast but shallow, so they produce noisy company lists with weak relevance;
- or they are thoughtful but manual, so volume collapses and momentum dies.

Opportunity Radar is designed to sit in the middle:

- wide public-source discovery;
- strict evidence-backed qualification;
- local queue-based control;
- human-in-the-loop outreach preparation instead of blind automation.

It is intentionally built as a single-user local tool, which keeps the workflow inspectable, cheaper to run, and easy to adapt.

## What it does

- Discovers organizations from public web search, procurement feeds, ATS pages, and structured sources.
- Separates raw discovery from card creation so sourcing can continue while analysis workers process candidates.
- Builds evidence-aware opportunity cards instead of dumping raw URLs.
- Distinguishes explicit opportunities from inferred needs.
- Scores fit, evidence confidence, and outreach readiness separately.
- Identifies a public contact only when a real public source supports the person and role.
- Generates outreach hooks, full messages, follow-ups, and opening questions.
- Tracks opportunity lifecycle states from fresh detection to contacted, replied, proposal, won, or lost.
- Lets the user pause, resume, retry, and inspect queue work without silent background behavior.

The application never sends outreach automatically.

## Product architecture

```text
Public sources
  Exa / Tavily / BOAMP / TED / ATS / official company websites
                       |
                       v
             Discovery queue candidate collection
                       |
                       v
         Candidate validation, deduplication, suppression
                       |
                       v
            Analysis queue company opportunity reasoning
                       |
                       v
     LLM adapter Codex CLI, OpenAI, or Anthropic with one schema
                       |
                       v
     Evidence-backed opportunity cards + contact + outreach drafts
                       |
                       v
      Radar / Monitor / Dashboard / Opportunities user interface
```

## Intelligence layer

The app uses one provider-neutral reasoning contract so the same opportunity schema, evidence rules, and validation logic remain stable even if the underlying model changes.

Supported providers:

- `codex` via authenticated Codex CLI
- `openai` via the Responses API
- `anthropic` via the Messages API

Fallbacks are optional and disabled by default so a local Codex failure does not silently spend API credits.

## Public repository scope

This repository is safe to share as a public code project after local credentials and generated runtime files are excluded. It contains:

- the Next.js application;
- queue orchestration and monitoring logic;
- source connectors and validation rules;
- provider adapters;
- tests for core logic.

It does not need to contain:

- API keys;
- local databases;
- local build output;
- `node_modules`;
- personal or organization-specific runtime logs.

## Requirements

- Windows with Node.js 22 or newer
- npm
- Codex CLI authenticated with `codex login` if you want the free local-default path
- Optional API keys for Exa, Tavily, Firecrawl, OpenAI, or Anthropic

## Quick start

```powershell
cd "C:\path\to\opportunity_radar"
Copy-Item .env.example .env.local
npm install
codex login
npm run dev
```

Open `http://127.0.0.1:3000`.

If another local project already uses port `3000`:

```powershell
npm run dev -- -p 3001
```

## Environment setup

All runtime configuration lives in `.env.local`. The committed template is `.env.example`.

### Default local path with Codex

```dotenv
OPPORTUNITY_RADAR_LLM_PROVIDER=codex
OPPORTUNITY_RADAR_CODEX_ENABLED=true
```

### OpenAI provider

```dotenv
OPPORTUNITY_RADAR_LLM_PROVIDER=openai
OPENAI_API_KEY=your_key_here
OPPORTUNITY_RADAR_OPENAI_MODEL=gpt-5.6-terra
```

### Anthropic provider

```dotenv
OPPORTUNITY_RADAR_LLM_PROVIDER=anthropic
ANTHROPIC_API_KEY=your_key_here
OPPORTUNITY_RADAR_ANTHROPIC_MODEL=claude-sonnet-5
```

### Discovery connectors

```dotenv
EXA_API_KEY=
TAVILY_API_KEY=
FIRECRAWL_API_KEY=

OPPORTUNITY_RADAR_EXA_ENABLED=true
OPPORTUNITY_RADAR_TAVILY_ENABLED=true
OPPORTUNITY_RADAR_BOAMP_ENABLED=true
OPPORTUNITY_RADAR_TED_ENABLED=true
OPPORTUNITY_RADAR_ATS_ENABLED=true
OPPORTUNITY_RADAR_FIRECRAWL_ENABLED=false
```

Firecrawl is only a bounded fallback for pages the normal crawler cannot parse cleanly. It is not the primary discovery engine.

## How to use it

1. Open the app and confirm your intelligence provider is ready in Settings.
2. Select the geographies, sectors, and services you want the radar to monitor.
3. Start a discovery run.
4. Watch `Monitor` to see queue progress, retries, failures, and provider activity.
5. Review `Opportunities` to inspect evidence, inferred needs, contacts, and generated outreach.
6. Mark cards as reviewed, contacted, rejected, or advanced as your pipeline evolves.

The system is designed to expose its reasoning path instead of hiding it.

## Safety and evidence rules

- Official or direct public sources are preferred over noisy aggregators.
- Opportunity cards are rejected when evidence is too weak.
- Public contacts are only kept when the role is supported by public evidence.
- Guessed email patterns are rejected.
- LinkedIn is not scraped or automated.
- Eliminated organizations stay suppressed so they do not keep coming back as noise.

## Quality checks

```powershell
npm run lint
npm test
npm run build
```

Tests use mocked responses for provider adapters and do not consume paid API credits.

## Suggested public publishing flow

1. Keep `.env.example` committed.
2. Do not commit `.env.local`.
3. Do not commit `data/`, `.next/`, `node_modules/`, or local logs.
4. Initialize a git repository if needed.
5. Push the clean folder to GitHub.

If you want to publish the project as a downloadable archive instead of GitHub first, zip the cleaned repository root after removing generated files and secrets.
