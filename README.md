# FoodStyles LLM Match

A Next.js web app that connects to a Google Sheet, reads its tabs, and runs LLM-based matching experiments to compare two locations (or two records) row by row. Results are written back into the sheet and summarized in the UI with simple run analytics and a run log.

## Why this exists

We needed a fast, repeatable way to validate and run location matching at scale without building a full data pipeline.

This tool was created to:
- Compare two locations using a consistent prompt and scoring rubric
- Batch work to keep requests efficient and avoid timeouts in serverless environments
- Provide a lightweight UI for non engineers to run experiments and review outcomes
- Log runs so we can track throughput, unsure rate, and changes over time

## What it does

Core workflow:
1. Paste a Google Sheets link (or sheet id)
2. The app reads available tabs (datasets) from the sheet
3. Choose a tab and run mode
4. The app loads pending rows and evaluates them using an OpenAI model
5. It writes verdicts and scores back into the sheet
6. It shows run status, last run summary, analytics, and a run log

Key features:
- Tab discovery from a provided sheet
- Batch processing (default batch size is 50 rows per call)
- Parallelism to speed up processing (default is 8)
- Settings for model and prompt
- Advanced settings for temperature, max output tokens, batch size, retries, and rate limit delay
- Review queue for rows that are unsure or low confidence
- Run history and analytics (throughput, distribution, unsure rate)

## Tech stack

- Next.js (App Router)
- TypeScript
- Recharts for charts
- Google Sheets API access (server routes)
- OpenAI API calls (server routes)

## Project structure

Top level (high level):
- `app/`  
  Next.js App Router entrypoint, API routes, and UI
- `app/page.tsx`  
  The main route. Renders the UI via `app/components/App.tsx`
- `app/components/`  
  Client UI broken into sections
- `app/api/`  
  Server routes used by the UI to talk to Google Sheets and OpenAI

UI components:
- `app/components/App.tsx`  
  Main client component. Holds page state, runs API calls, and composes the UI sections
- `app/components/types.ts`  
  Shared TypeScript types for responses and UI data
- `app/components/constants.ts`  
  Shared constants like known models and pricing estimates
- `app/components/settings/`  
  Settings UI for model, prompt, and advanced tuning
- `app/components/run/`  
  Run controls, current status, and last run summary
- `app/components/analytics/`  
  Analytics charts and run log table
- `app/components/review/`  
  Review queue for rows that need attention

API routes (names may vary slightly depending on your branch):
- `GET /api/sheet-tabs`  
  Reads the tabs from the given sheet
- `GET /api/status`  
  Reads progress status for the selected tab
- `POST /api/start`  
  Runs evaluation for a chunk of rows and writes results back
- `GET /api/run-history`  
  Returns run history for analytics and the run log
- `GET /api/review-queue`  
  Returns rows that need attention (unsure or low confidence)
- `GET, POST /api/config`  
  Loads and saves config used for runs

There are also `api/test-*` routes used for debugging connectivity.

## How batching and parallelism work

- Batch size controls how many rows are processed per server call. Default is 50.
- Parallelism controls how many row evaluations can be processed concurrently inside a run. Default is 8.
- The UI may call the start endpoint multiple times until the requested limit is reached or there are no pending rows.

This design keeps server calls short and predictable, helps avoid Vercel timeouts, and maintains high throughput.

## How to run locally

Prereqs:
- Node.js (use the version your project expects)
- npm

Install:
~~~bash
npm install
~~~

Run dev:
~~~bash
npm run dev
~~~

Build:
~~~bash
npm run build
npm run start
~~~

## Configuration and secrets

You will need credentials for:
- Google Sheets access (server routes)
- OpenAI access (server routes)

Where those are configured depends on your setup:
- In local development, use `.env.local`
- In production, use Vercel environment variables

Common variables in this type of project include:
- `OPENAI_API_KEY`
- Google service account credentials or tokens used by your Sheets helper code

If your UI asks for an OpenAI key directly, treat it as sensitive:
- Do not commit it
- Do not paste it into logs
- Prefer server side env vars when possible

## How to use the app

1. Open the app
2. Paste a Google Sheets URL or sheet id
3. Select the dataset tab
4. Pick mode:
   - Production for bulk runs
   - Testing for evaluation against labeled rows (if supported by your sheet template)
5. Adjust settings:
   - Model selection
   - Prompt template
6. Adjust advanced settings only if needed:
   - Temperature
   - Max output tokens
   - Batch size
   - Max retries
   - Rate limit delay
   - Parallelism
7. Click Run
8. Watch Status and Last run
9. Use Analytics and Run log to sanity check throughput and distributions
10. Use Review queue to inspect unsure or low confidence cases

## Notes on the Google Sheet format

The sheet is expected to have:
- A tab that contains the input columns for the two locations
- Output columns where the app writes:
  - verdict
  - match_score
  - notes
  - confidence (if used)

The exact column names and scoring map are defined by the backend and the prompt template. Check the API route that writes back to the sheet to see the expected column mapping.

## Deployment

Designed for Vercel:
- Push to main
- Vercel builds and deploys
- Set required environment variables in Vercel Project Settings
