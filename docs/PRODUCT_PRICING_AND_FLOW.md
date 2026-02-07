# AIOpt — 결제까지 이어지는 제품 설계 (현실 버전)

대상: 바이브코더(개인/소규모 팀). 서버 없이(로컬 CLI)로 시작해서 **설치형 가드레일**을 반복 사용하게 만들고, Pro/Team(라이선스)로 전환.

## 1) 핵심 메시지(포지셔닝)
- AIOpt는 **scan 툴**이 아니라 **install-first 비용 가드레일**이다.
- 서버/업로드/계정 없이: **로컬에서만** 비용·낭비·정책을 만든다.

## 2) 유저 라이프사이클(발견→사용→결제)

### A. 발견(Discovery)
유입 채널:
- 검색: “LLM API cost”, “Cursor 비용”, “OpenAI 비용 줄이기”, “usage.jsonl”, “guardrails”
- 커뮤니티: X/Reddit/HN/Discord (1줄 npx가 강함)

랜딩에서 5초 안에 보여줄 것:
- `npx aiopt install --force` → `doctor` → `scan` 결과 스샷(또는 샘플)
- “No server / No upload / No LLM calls”

### B. Activation(첫 성공)
성공 기준(3분):
- install로 정책/usage.jsonl scaffold 생성
- doctor로 상태 체크
- scan으로 `report.md` + `patches/` 생성

### C. Habit(반복 사용)
반복 트리거:
- 릴리즈 전 체크리스트에 `aiopt scan`
- 비용 폭주/타임아웃 발생 시 `aiopt scan`으로 즉시 원인 후보+수정 파일 제시

### D. 전환(결제)
결제 트리거:
- “절감액 > 구독료”가 1주 내에 보일 때
- 더 정확한 시뮬레이터/더 넓은 rate table/정책팩(템플릿) 필요

---

## 3) 가격/플랜(서버 없이 가능한 모델)

### Free (OSS)
- install/doctor/scan
- 기본 rate table (subset)
- 기본 patch stubs

### Pro (개인) — $19/mo 또는 $149/yr
서버 없이 제공 가능한 가치:
- **정책팩(프리셋)**: agent/chatbot/rag/summarize 등 상황별 최적 규칙 세트
- **확장 rate table**: 더 많은 모델/티어 + 업데이트
- **정확도 강화 모드**: 추정값 band 출력(LOW/MED/HIGH) + 과대추정 경고 강화
- **보고서 템플릿**: report.md에 “바로 바꿀 코드/파일” 더 구체화

### Team — $49/mo (5 seats) + seat 추가
- 팀 공용 정책팩 배포(로컬)
- 규칙 lint(정책 충돌/중복 감지)
- 프로젝트별 프로필(로컬) 지원

---

## 4) 라이선스/결제 플로우(서버 최소)

권장(현실적): 외부 결제 + 로컬 라이선스 키
- 결제: Gumroad/Polar 등(결제/인보이스)
- 발급: 라이선스 키/토큰
- 적용:
  - `aiopt license set <KEY>` (로컬 파일 저장)
  - Pro 기능 unlock

서버를 피하면서도 최소 검증 방법(선택):
- 키 서명 기반(오프라인)
  - 발급 시 서명된 토큰(JWT-like)
  - CLI는 공개키로 검증(온라인 필요 없음)

---

## 5) KPI (실제로 개선/결제까지 보려면)
- Discovery → Activation:
  - GitHub 방문 대비 `npx aiopt install` 실행 비율
  - install 후 doctor 실행 비율
- Value:
  - scan 실행 후 report.md 열람(또는 patches 폴더 생성 확인)
- Retention:
  - 7일 내 재실행(install/scan)
- Monetization:
  - Pro 전환율

---

## 6) 검증 체크리스트(랜딩/제품)
- [ ] 랜딩 첫 화면에서 1줄로 ‘무엇인지’ 이해 가능
- [ ] 3분 내 재현 가능한 Quickstart 제공
- [ ] 샘플 report.md에 WHAT TO CHANGE가 명확
- [ ] Pro의 가치가 ‘무료 대비 무엇이 더 정확/편한가’로 설명됨
