# Contributing

Thanks for helping.

## Dev
```bash
npm i
npm run build
node dist/cli.js init
node dist/cli.js scan
```

## Rules
- No servers, no log upload, no login flows.
- No LLM calls (math + deterministic rules only).
- Keep outputs deterministic for identical inputs.
