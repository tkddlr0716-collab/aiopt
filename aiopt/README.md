# AIOpt

AIOpt는 **scan툴이 아니라 설치형 비용 가드레일이다.**

- 서버/대시보드/계정/업로드/결제/프록시 없음
- 로컬 파일 기반: `aiopt/policies/*.json` + `aiopt-output/usage.jsonl`
- 실행 중에 wrapper가 사용량을 기록하고, `scan`이 그 로그를 읽어 비용/세이빙을 계산한다

## 5-minute demo (fresh dir)

```bash
mkdir -p /tmp/aiopt-demo && cd /tmp/aiopt-demo

# 1) install guardrails files
npx aiopt install --force

# 2) verify install + show last 5 usage lines
npx aiopt doctor

# 3) your app runs (wrapper writes JSONL)
#    (see below for a minimal node script)

# 4) scan (defaults to ./aiopt-output/usage.jsonl)
npx aiopt scan
```

## Wrapper (Node.js) — minimal example

Create `demo.js` in your project root:

```js
const path = require('path');
const cwd = process.cwd();
const { guardedCall } = require(path.join(cwd, 'aiopt', 'aiopt-wrapper.js'));

async function main(){
  // Simulated provider call (replace with real SDK call)
  await guardedCall(cwd, {
    provider: 'openai',
    model: 'gpt-5-mini',
    endpoint: 'responses.create',
    feature_tag: 'summarize',
    prompt_tokens: 100,
    trace_id: 'demo-1'
  }, async (req) => {
    // You can return either normalized fields...
    // return { status: 'ok', completion_tokens: 20 };

    // ...or an OpenAI-style usage object (AIOpt will extract tokens)
    return {
      status: 'ok',
      response: { usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 } }
    };
  });

  console.log('wrote usage line -> aiopt-output/usage.jsonl');
}

main().catch((e)=>{ console.error(e); process.exit(1); });
```

Run:

```bash
node demo.js
tail -n 2 aiopt-output/usage.jsonl
```

## What gets installed

- `aiopt/aiopt.config.json`
- `aiopt/policies/` (routing/retry/output/context)
- `aiopt/aiopt-wrapper.js` (guardrails + JSONL logging)
- `aiopt-output/usage.jsonl`

## CLI

- `npx aiopt install [--force]`
- `npx aiopt doctor`
- `npx aiopt scan [--input <path>]` (MVP: local-only)
