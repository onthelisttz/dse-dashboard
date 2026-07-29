# DSE Dashboard

Real-time Dar es Salaam Stock Exchange market data dashboard with live price tracking, interactive charts, order book data, company comparison, and price alerts.

![DSE Dashboard Screenshot](/screenshots/dashboard.png)

## Features

- **Live Price Ticker** — Scrolling ticker bar with real-time prices and daily changes
- **Interactive Price Chart** — Area and candlestick views, daily/weekly aggregation, configurable time ranges (1Y/2Y/3Y/All/Custom), fullscreen mode, keyboard navigation between companies
- **Order Book** — Best bid/offer display with a fee-aware P&L calculator (broker, CMSA, CSDR, DSE, fidelity fees)
- **Market Overview** — Sortable, searchable, paginated table of all securities with prices, changes, volumes, limits, and market cap
- **Company Comparison** — Multi-line overlay chart comparing up to 8 companies
- **Top Performers** — Gainers and losers display
- **Statistics Cards** — KPI cards for market price, volume, day range, market cap
- **Price Alerts** — Create alerts by clicking on the chart, set above/below thresholds, add comments/expiry, filter by status/date, table and list views
- **Email Notifications** — Triggered alerts send emails via SMTP
- **Push Notifications** — Web push notifications via VAPID and Service Worker
- **Dark/Light Theme** — Toggle between dark and light modes
- **Responsive Design** — Mobile-friendly layout

## Tech Stack

| Category | Technology |
|---|---|
| **Framework** | Next.js 16 (App Router) |
| **UI** | React 19, TypeScript, Tailwind CSS 4, shadcn/ui |
| **Charts** | TradingView Lightweight Charts |
| **Data Fetching** | SWR |
| **Auth & DB** | Supabase (Google OAuth, PostgreSQL, RLS) |
| **Notifications** | Nodemailer (email), Web Push API (browser) |
| **Package Manager** | Bun |

## Getting Started

### Prerequisites

- [Bun](https://bun.sh) v1.3+
- A Supabase project with Google OAuth enabled
- SMTP credentials (for email alerts)
- VAPID keys (for web push notifications)

### Installation

```bash
git clone <repo-url>
cd dse
bun install
```

### Environment Variables

Copy the following into a `.env` file:

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=<your-supabase-url>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-supabase-anon-key>
SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>

# SMTP (email alerts)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=<your-email>
SMTP_PASS=<your-app-password>

# Web Push (VAPID)
NEXT_PUBLIC_VAPID_PUBLIC_KEY=<your-vapid-public-key>
VAPID_PRIVATE_KEY=<your-vapid-private-key>
VAPID_SUBJECT=mailto:<your-email>

# Cron
CRON_SECRET=<a-random-secret>
```

### Database

Run the SQL migration in `supabase/schema.sql` against your Supabase project's SQL editor.

### Development

```bash
bun run dev
```

Open [http://localhost:3000](http://localhost:3000) and sign in with Google.

### Setting Up Alerts

See [docs/alerts-auth-setup.md](docs/alerts-auth-setup.md) for detailed instructions on:
- Configuring Supabase Google OAuth
- Setting up the database schema
- Generating VAPID keys
- Configuring cron-job.org for automatic alert checking

## Deployment

The project is ready for deployment on Vercel. The `vercel.json` configuration uses Bun:

```json
{
  "buildCommand": "bun run build",
  "installCommand": "bun install"
}
```

Add all environment variables in your Vercel project settings.

## Project Structure

```
app/              Next.js App Router pages and API routes
components/       React components (UI, dashboard, charts, alerts)
lib/              Shared utilities, types, hooks, Supabase clients
public/           Static assets (service worker, screenshots)
supabase/         Database schema and migrations
docs/             Documentation
```

## License

MIT
