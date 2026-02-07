# AIOpt — 결제까지 이어지는 제품 설계 (현실 버전)

대상: 바이브코더(개인/소규모 팀). 서버 없이(로컬 CLI)로 시작해서 **릴리즈 전 비용 사고를 막는 Guardrail**을 습관적으로 돌리게 만들고, Pro/Team(라이선스)로 전환.

## 1) 핵심 메시지(포지셔닝)
- AIOpt는 **사후 분석 대시보드**가 아니라 **사전 비용 사고 방지(Guardrail)** 이다.
- 서버/업로드/계정 없이: **로컬에서만** baseline 로그 + 후보 변경을 비교해 위험도를 낸다.

## 2) 유저 라이프사이클(발견→사용→결제)

### A. 발견(Discovery)
유입 채널:
- 검색: “LLM API cost”, “Cursor 비용”, “OpenAI 비용 폭주”, “usage.jsonl”, “cost guardrail”
- 커뮤니티: X/Reddit/HN/Discord (1줄 npx가 강함)

랜딩에서 5초 안에 보여줄 것:
- `npx aiopt install --force` → `doctor` → `guard` 콘솔 출력
- “No server / No upload / No LLM calls”

### B. Activation(첫 성공)
성공 기준(3분):
- `install`로 로컬 scaffold 생성
- `doctor`로 입력/환경 체크
- `guard`로 **월간 비용 영향 + 위험도(WARN/FAIL) + confidence** 출력

> (선택) 더 깊은 로컬 분석이 필요하면 `scan`으로 report/patch stub을 만들 수 있지만, 메인 가치는 guardrail에 둔다.

### C. Habit(반복 사용)
반복 트리거:
- PR/릴리즈 전 체크리스트에 `aiopt guard`
- 모델 변경/프롬프트 증대/리트라이 증가/트래픽 스파이크가 있을 때

### D. 전환(결제)
결제 트리거:
- “월간 예상 증분 비용(impact) > 구독료”가 1주 내에 보일 때
- 팀에서 표준화된 guard 정책/리포트 템플릿/확장 rate table이 필요할 때

---

## 3) 가격/플랜(서버 없이 가능한 모델)

### Free (OSS)
- install/doctor/guard (+ optional scan/dashboard)
- 기본 rate table
- 기본 exit code/요약 리포트

### Pro (개인)
서버 없이 제공 가능한 가치:
- **확장 rate table**: 더 많은 모델/티어 + 업데이트
- **정확도/신뢰도 강화**: confidence 근거 및 데이터 품질 경고 강화
- **보고서 템플릿**: guard 출력/요약 포맷(팀 공유에 적합)

### Team
- 팀 공용 정책/프리셋 배포(로컬)
- 프로젝트별 프로필(로컬)

---

## 4) 라이선스/결제 플로우(서버 최소)

권장(현실적): 외부 결제 + 로컬 오프라인 라이선스 키
- 결제: Polar
- 전달: 이메일/다운로드 등으로 라이선스 키 제공
- 적용:
  - `aiopt license activate <KEY>` (로컬 파일 저장)
  - `aiopt license verify` (오프라인 공개키 검증)

서버를 피하면서도 최소 검증 방법:
- 키 서명 기반(오프라인)
  - 발급 시 서명된 토큰(JWT-like)
  - CLI는 공개키로 검증(온라인 필요 없음)

---

## 5) KPI (실제로 개선/결제까지 보려면)
- Discovery → Activation:
  - GitHub 방문 대비 `npx aiopt install` 실행 비율
  - install 후 guard 실행 비율
- Value:
  - PR에서 guard 출력(요약) 공유 비율
- Retention:
  - 7일 내 재실행(guard)
- Monetization:
  - Pro 전환율

---

## 6) 검증 체크리스트(랜딩/제품)
- [ ] 랜딩 첫 화면에서 1줄로 ‘무엇인지’ 이해 가능
- [ ] 3분 내 재현 가능한 Quickstart 제공
- [ ] Guard 결과가 “merge를 막을지/경고만 할지” 명확
- [ ] Pro의 가치가 ‘무료 대비 무엇이 더 정확/편한가’로 설명됨
