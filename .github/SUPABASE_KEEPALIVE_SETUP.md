# Supabase Database Keep-Alive Setup

This project includes an automated workflow to keep the Supabase database active and prevent it from pausing due to inactivity on the free tier.

## How It Works

A GitHub Actions workflow runs automatically every Monday at 00:00 UTC (you can customize this schedule). The workflow makes a simple API call to the Supabase REST API to keep the database connection active.

## Setup Instructions

To enable this feature, you need to add your Supabase credentials to your GitHub repository secrets:

### Step 1: Get Your Supabase Credentials

1. Go to your [Supabase Dashboard](https://app.supabase.com)
2. Select your project
3. Go to **Settings** → **API**
4. Copy your **Project URL** (e.g., `https://xxxxx.supabase.co`)
5. Copy your **Project API Key** (the anon public key)

### Step 2: Add GitHub Secrets

1. Go to your GitHub repository
2. Navigate to **Settings** → **Secrets and variables** → **Actions**
3. Click **New repository secret**
4. Add two secrets:
   - **Name**: `REACT_APP_SUPABASE_URL` | **Value**: Your Project URL (e.g., `https://xxxxx.supabase.co`)
   - **Name**: `REACT_APP_SUPABASE_PUBLISHABLE_DEFAULT_KEY` | **Value**: Your Project API Key

### Step 3: Verify the Workflow

1. Go to the **Actions** tab in your GitHub repository
2. You should see the "Keep Supabase DB Active" workflow
3. You can manually trigger it by clicking **Run workflow** to test it
4. The workflow will automatically run every Monday at 00:00 UTC

## Customizing the Schedule

To change when the workflow runs, edit [.github/workflows/keep-db-active.yml](.github/workflows/keep-db-active.yml) and modify the `cron` expression:

```yaml
on:
  schedule:
    - cron: '0 0 * * 1'  # Change this cron expression
```

Common cron expressions:
- `'0 0 * * 0'` - Every Sunday at 00:00 UTC
- `'0 0 * * *'` - Every day at 00:00 UTC
- `'0 */6 * * *'` - Every 6 hours
- `'0 0 * * 1'` - Every Monday at 00:00 UTC (default)

For more info on cron syntax, see [crontab.guru](https://crontab.guru)

## Testing

You can manually trigger the workflow from the GitHub **Actions** tab to verify it works without waiting for the scheduled time.

## Troubleshooting

If the workflow fails:
1. Check that your `REACT_APP_SUPABASE_URL` includes the full URL with `https://`
2. Verify your `REACT_APP_SUPABASE_PUBLISHABLE_DEFAULT_KEY` is the correct API key
3. Check the workflow logs in the **Actions** tab for error details
4. Ensure the secrets are named exactly `REACT_APP_SUPABASE_URL` and `REACT_APP_SUPABASE_PUBLISHABLE_DEFAULT_KEY`
