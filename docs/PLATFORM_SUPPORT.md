# AIOpt Platform Support (검수 기준)

AIOpt는 **Node.js 기반 로컬 CLI**로 동작하며, GitHub Actions CI에서 아래 매트릭스로 지속 검증합니다.

## Official CI Matrix
- OS: **Windows / macOS / Linux**
- Node: **18 / 20 / 22**

CI는 다음을 검증합니다:
- `install → doctor → (fake usage) → scan` produces required outputs
- `guard` exit code handling + summary output
- fixtures 기반 `npm run test:guard`
- offline license `npm run test:license`

## Local Requirements
- Node.js >= 18
- `npx` 사용 가능(npm 포함)

## Windows Notes
- GitHub Actions에서는 `bash`가 제공되어(Windows runner에 Git Bash 포함) CI의 guard summary 단계가 동작합니다.
- 로컬에서 테스트할 때는 PowerShell에서도 동작합니다.

### PowerShell quick smoke
```powershell
mkdir aiopt-test; cd aiopt-test
npx --yes aiopt install --force
node -e "const fs=require('fs');fs.mkdirSync('aiopt-output',{recursive:true});for(let i=0;i<10;i++)fs.appendFileSync('aiopt-output/usage.jsonl',JSON.stringify({ts:new Date().toISOString(),provider:'openai',model:'gpt-5-mini',prompt_tokens:10000,completion_tokens:1000,endpoint:'responses',attempt:1,trace_id:'t'+i,status:'ok',meta:{feature_tag:'summarize'}})+'\n');"
npx --yes aiopt guard --context-mult 1.2 --call-mult 10
npx --yes aiopt dashboard --port 3010
```

## macOS / Linux quick smoke
```bash
mkdir -p aiopt-test && cd aiopt-test
npx --yes aiopt install --force
node -e "const fs=require('fs');fs.mkdirSync('aiopt-output',{recursive:true});for(let i=0;i<10;i++)fs.appendFileSync('aiopt-output/usage.jsonl',JSON.stringify({ts:new Date().toISOString(),provider:'openai',model:'gpt-5-mini',prompt_tokens:10000,completion_tokens:1000,endpoint:'responses',attempt:1,trace_id:'t'+i,status:'ok',meta:{feature_tag:'summarize'}})+'\\n');"
npx --yes aiopt guard --context-mult 1.2 --call-mult 10
npx --yes aiopt dashboard --port 3010
```

## Known Limitations
- `dashboard`는 **127.0.0.1 바인딩**(로컬 전용)이라 외부에서 접근할 수 없습니다.
- baseline `usage.jsonl`의 `ts` span이 너무 짧으면 confidence가 data-quality로 하향될 수 있습니다.
