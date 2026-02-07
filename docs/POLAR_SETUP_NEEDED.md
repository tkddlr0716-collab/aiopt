# Polar setup needed (minimal input)

To fully enable real payments, we only need **two Polar checkout URLs**:

- `POLAR_PRO_URL`  (Pro checkout)
- `POLAR_TEAM_URL` (Team checkout)

Where they are used:
1) `aiopt-landing` (dynamic server): injected into `/buy` via env vars.
2) `aiopt` GitHub Pages static site (`site/buy.html`): optional injection via query params for now.

## After you have the URLs
### Option A) Landing server (recommended)
```bash
export POLAR_PRO_URL='https://polar.sh/...'
export POLAR_TEAM_URL='https://polar.sh/...'
pm2 restart aiopt-landing --update-env
```

### Option B) GitHub Pages static buy page
Update `site/buy.html` to hardcode the two links, or use query params:

`/buy.html?pro=<url>&team=<url>`

## Note
Payout bank account linking is not required to wire the buttons, but may be required to actually receive payouts depending on Polar/KYC stage.
