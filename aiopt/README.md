# AIOpt

AIOpt는 **scan툴이 아니라 설치형 비용 가드레일이다.**

## Quick start
```bash
npx aiopt install --force
npx aiopt doctor
# (your app runs, wrapper logs usage)
npx aiopt scan
```

- 서버/대시보드/계정/업로드/결제/프록시 없음
- 로컬 파일 기반(정책 + usage.jsonl)
- LLM 호출 금지(수학/룰 기반)

## Wrapper usage (Node.js)

AIOpt 설치 후, 앱 코드에서 wrapper를 불러서 사용량 JSONL을 자동 기록할 수 있습니다.


a) 최소 형태(토큰을 직접 넘김)

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
  // req: { provider, model, endpoint, max_output_tokens, prompt_tokens, idempotency_key }
  // 여기서 실제 SDK 호출 후 결과를 반환
  return { status: 'ok', completion_tokens: 200 };
});
```

b) OpenAI-style 응답(usage 자동 추출)

```js
return {
  status: 'ok',
  response: {
    usage: { prompt_tokens: 1200, completion_tokens: 200, total_tokens: 1400 }
  }
};
```
