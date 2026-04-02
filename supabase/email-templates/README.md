# Odd Wheels Auth Email Templates

These files are branded replacements for Supabase's default authentication emails.

## Included templates

- `confirmation.html`
  Subject: `Confirm your Odd Wheels email`
- `recovery.html`
  Subject: `Reset your Odd Wheels password`
- `magic-link.html`
  Subject: `Your Odd Wheels sign-in link`
- `invite.html`
  Subject: `You're invited to Odd Wheels`
- `email-change.html`
  Subject: `Confirm your new Odd Wheels email`
- `reauthentication.html`
  Subject: `Your Odd Wheels verification code`

## How to apply them in Supabase

For hosted Supabase projects:

1. Open `Authentication -> Email Templates`.
2. Pick the matching template in the dashboard.
3. Copy the HTML from the corresponding file here.
4. Replace the subject with the one listed above.
5. Save.

## Sender branding

To stop emails from showing `Supabase Auth <noreply@mail.app.supabase.io>`, configure custom SMTP in `Authentication -> Settings`.

Recommended values:

- Sender name: `Odd Wheels`
- From address: `no-reply@odd-wheels.com`

## Optional: generate a Management API payload

Run:

```bash
node scripts/build-supabase-auth-email-config.mjs
```

That prints a JSON payload you can send to the Supabase Management API.

To apply directly with the Supabase Management API:

```bash
SUPABASE_ACCESS_TOKEN=your_pat_here npm run auth:emails:apply
```

Optional:

- `SUPABASE_PROJECT_REF`
  If omitted, the script derives it from `NEXT_PUBLIC_SUPABASE_URL`.

## Notes

- These templates intentionally stay short and transactional to protect deliverability.
- They use Supabase variables such as `{{ .ConfirmationURL }}` and `{{ .Token }}`.
- They assume your Site URL is set to `https://www.odd-wheels.com`.
