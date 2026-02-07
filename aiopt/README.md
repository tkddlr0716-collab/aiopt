# AIOpt

AIOpt는 **scan툴이 아니라 설치형 비용 가드레일이다.**

- 서버/대시보드/계정/업로드/결제/프록시 없음
- 로컬 파일 기반(정책 + usage.jsonl)
- LLM 호출 금지(수학/룰 기반)

## Quick start (5분)

```bash
npx aiopt install --force
npx aiopt doctor
# (your app runs, wrapper logs usage)
npx aiopt scan
```

- 기본 입력: `./aiopt-output/usage.jsonl`
- 기본 출력: `./aiopt-output/report.md` + `./aiopt-output/report.json` (+ `./aiopt-output/patches/*`)

## 3-minute before/after (Node.js)

### Before

```js
// app.js
async function callLLM(openai) {
  const res = await openai.responses.create({
    model: 'gpt-5-mini',
    input: 'Summarize this...'
  });

  // ...your app logic...
  return res;
}
```

### After (wrapper로 기록 + 정책 적용)

```js
// app.js
const { guardedCall } = require('./aiopt/aiopt-wrapper.js');

async function callLLM(openai) {
  return guardedCall(process.cwd(), {
    provider: 'openai',
    model: 'gpt-5-mini',
    endpoint: 'responses.create',
    feature_tag: 'summarize',
    trace_id: 'trace-123'
  }, async (req) => {
    // req: { provider, model, endpoint, max_output_tokens, prompt_tokens, idempotency_key, ... }
    // NOTE: wrapper는 정책에 따라 모델 라우팅/캡(max_output_tokens)/재시도 등을 적용할 수 있습니다.

    const res = await openai.responses.create({
      model: req.model,
      input: 'Summarize this...',
      max_output_tokens: req.max_output_tokens
    });

    return {
      status: 'ok',
      response: res
    };
  });
}
```

## Wrapper usage (minimal)

AIOpt 설치 후, 앱 코드에서 wrapper를 불러서 사용량 JSONL을 자동 기록할 수 있습니다.

### A) 최소 형태(토큰을 직접 넘김)

```js
const { guardedCall } = require('./aiopt/aiopt-wrapper.js');

await guardedCall(process.cwd(), {
  provider: 'openai',
  model: 'gpt-5-mini',
  endpoint: 'responses.create',
  feature_tag: 'summarize',
  prompt_tokens: 1200,
  trace_id: 'my-trace'
}, async (req) => {
  // 여기서 실제 SDK 호출 후 결과를 반환
  return { status: 'ok', completion_tokens: 200 };
});
```

### B) OpenAI-style 응답(usage 자동 추출)

```js
return {
  status: 'ok',
  response: {
    usage: { prompt_tokens: 1200, completion_tokens: 200, total_tokens: 1400 }
  }
};
```

## Fresh project 5-min reproduction (script)

이 레포를 클론한 상태에서, 완전 빈 디렉토리에서 재현하려면:

```bash
# 0) (repo) build + pack
npm ci
npm run build
npm pack  # => aiopt-*.tgz 생성

# 1) (empty dir) install + init
mkdir -p /tmp/aiopt-fresh && cd /tmp/aiopt-fresh
npm init -y
npm i -D /path/to/aiopt/aiopt-*.tgz

# 2) scaffold + doctor
npx aiopt install --force
npx aiopt doctor

# 3) (optional) generate 10 fake usage lines
node -e "const fs=require('fs');const p='aiopt-output/usage.jsonl';fs.mkdirSync('aiopt-output',{recursive:true});for(let i=0;i<10;i++)fs.appendFileSync(p,JSON.stringify({ts:new Date().toISOString(),request_id:'r'+i,trace_id:'t',attempt:1,status:'ok',error_code:null,provider:'openai',model:'gpt-5-mini',endpoint:'responses.create',prompt_tokens:1000,completion_tokens:200,total_tokens:1200,cost_usd:0.01,latency_ms:123,meta:{feature_tag:'demo'}})+'\\n');"

# 4) scan
npx aiopt scan
# 결과: aiopt-output/report.md, report.json, patches/*
```
