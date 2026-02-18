# AIOpt Platform Support (검수 기준)

AIOpt는 **Node.js 기반 로컬 CLI**입니다.
- 기본 모드(Guardrail): **완전 로컬/결정적(deterministic)** — 업로드/계정/서버 없음
- 로컬 리포트 생성: `scan` (로컬 파일 입출력)

## Official CI Matrix
- OS: **Windows / macOS / Linux**
- Node: **18 / 20 / 22**

CI에서 확인하는 것:
- `install → doctor → guard` (exit code/요약 출력)
- `guard` diff mode: `--baseline/--candidate`로 **실제 두 로그 비교**
- `guard` budget gate: `--budget-monthly` 플래그 경로
- (옵션) `scan` 기본 경로에서 동작 및 산출물 생성
- fixtures 기반 `npm run test:guard`
- offline license `npm run test:license`

## Local Requirements
- Node.js >= 18
- `npx` 사용 가능(npm 포함)

## Windows Notes
- GitHub Actions Windows runner에는 `bash`가 제공되어(= Git Bash) Step Summary 파이프가 동작합니다.
- 로컬에서는 **PowerShell/CMD**에서도 동작해야 합니다.

### PowerShell quick smoke
```powershell
mkdir aiopt-test; cd aiopt-test
npx --yes aiopt install --force
node -e "const fs=require('fs');fs.mkdirSync('aiopt-output',{recursive:true});for(let i=0;i<10;i++)fs.appendFileSync('aiopt-output/usage.jsonl',JSON.stringify({ts:new Date().toISOString(),provider:'openai',model:'gpt-5-mini',prompt_tokens:10000,completion_tokens:1000,endpoint:'responses',attempt:1,trace_id:'t'+i,status:'ok',meta:{feature_tag:'summarize'}})+'\n');"
npx --yes aiopt guard --context-mult 1.2 --call-mult 10
npx --yes aiopt scan
```

## macOS / Linux quick smoke
```bash
mkdir -p aiopt-test && cd aiopt-test
npx --yes aiopt install --force
node -e "const fs=require('fs');fs.mkdirSync('aiopt-output',{recursive:true});for(let i=0;i<10;i++)fs.appendFileSync('aiopt-output/usage.jsonl',JSON.stringify({ts:new Date().toISOString(),provider:'openai',model:'gpt-5-mini',prompt_tokens:10000,completion_tokens:1000,endpoint:'responses',attempt:1,trace_id:'t'+i,status:'ok',meta:{feature_tag:'summarize'}})+'\\n');"
npx --yes aiopt guard --context-mult 1.2 --call-mult 10
npx --yes aiopt scan
```

## Known Limitations / Caveats
- baseline `usage.jsonl`의 `ts` span이 너무 짧으면 confidence가 data-quality로 하향될 수 있습니다.
- Unknown model/provider는 rate table에서 `Estimated`로 처리될 수 있습니다.
- `provider=local`(또는 `ollama`/`vllm`)은 기본적으로 **$0로 가정**합니다. (CPU/GPU/서빙 비용은 포함하지 않음)
