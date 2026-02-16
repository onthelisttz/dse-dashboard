# Auth + Alerts Setup

## 1) Supabase setup

1. Enable Google provider in `Authentication -> Providers -> Google`.
2. Add redirect URL:
   - `http://localhost:3000/callback`
   - Your production callback, for example: `https://your-domain.com/callback`
3. Run `supabase/schema.sql` in the SQL editor.

## 2) Environment variables

Copy `.env.example` to `.env.local` and set real values:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_SUPABASE_REDIRECT_URI`
- SMTP vars (`MAIL_*`)
- Web Push vars (`NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY`, `WEB_PUSH_PRIVATE_KEY`, `WEB_PUSH_SUBJECT`)
- `CRON_SECRET`

## 3) Web push keys

Generate VAPID keys:

```bash
npx web-push generate-vapid-keys
```

Use the generated keys for:

- `NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY`
- `WEB_PUSH_PRIVATE_KEY`

## 4) Vercel setup

1. Add all env vars in Vercel project settings.
2. Ensure `CRON_SECRET` is set (used by `/api/alerts/check`).
3. Deploy. Cron is already configured in `vercel.json` to run every 5 minutes.

## 5) Runtime behavior

- Dashboard route requires login.
- Users can add/drag/delete chart alerts.
- Alert list appears as the last dashboard section.
- Triggered alerts send:
  - Email through configured SMTP.
  - Push notification to subscribed browsers/devices.
