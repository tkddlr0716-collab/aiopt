# Payment & License (Polar) — 운영 가이드

AIOpt는 **서버 없는 로컬 CLI**입니다. 결제는 Polar로 받고, 제품 기능 unlock은 **오프라인 서명 라이선스 키**로 처리합니다.

## 선택: Polar
- Checkout/세금/구독 관리가 쉬움
- 결제 완료 후 email/webhook 기반으로 라이선스 키 전달 가능

## Landing 구성
- 소개/체험: `/` (install → guard)
- 결제: `/buy` (Polar checkout 링크 + 활성화 안내)

`aiopt-landing/server.js`는 아래 env를 읽어 buy 버튼 링크를 채웁니다:
- `POLAR_PRO_URL`
- `POLAR_TEAM_URL`

## 라이선스 키 포맷
- `<payloadB64Url>.<sigB64Url>`
- payload(JSON) 예:
  - `sub` customer id/email
  - `plan` trial/pro/team
  - `iat`, `exp` (unix seconds)
  - `features` (optional)

## 유저 활성화
```bash
npx aiopt license activate <LICENSE_KEY>
npx aiopt license status
npx aiopt license verify
```

## 운영(발급) 방식 (서버 없이도 가능)
1) 오프라인에서 RSA private key로 payload를 서명해서 key 생성
2) 구매자에게 key 전달(이메일/다운로드)
3) 클라이언트는 public key로 오프라인 검증

> 현재 repo에는 **public key만** 들어있고, private key는 절대 커밋하지 않습니다.

## 다음 단계(서비스화)
- Polar 상품 URL 확정 후 `POLAR_PRO_URL`, `POLAR_TEAM_URL` 환경변수 설정
- 결제 완료 후 자동 발급(웹훅/스크립트) 파이프라인 연결(추후)
