# Contributing

Thanks for helping.

## Dev
```bash
npm i
npm run build
node dist/cli.js init
node dist/cli.js scan
```

## TaskTracker (local)
If you're running the local TaskTracker (default: http://localhost:3003), you can list open tasks:
```bash
npm run task:open
# or
TASKTRACKER_URL=http://localhost:3003/api/tasks npm run task:open
```

## Rules
- No servers, no log upload, no login flows.
- No LLM calls (math + deterministic rules only).
- Keep outputs deterministic for identical inputs.
