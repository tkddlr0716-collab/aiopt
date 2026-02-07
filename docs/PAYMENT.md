# Payment & License (Polar) — 운영 가이드

AIOpt는 **서버 없는 로컬 CLI**입니다. 결제는 Polar로 받고, 제품 기능 unlock은 **오프라인 서명 라이선스 키**로 처리합니다.

## 선택: Polar
- Checkout/세금/구독 관리가 쉬움
- 결제 완료 후 email/webhook 기반으로 라이선스 키 전달 가능

## Landing 구성
- 소개/체험: `/` (install → guard)
- 결제: `/buy` (Polar checkout 링크 + 활성화 안내)

### GitHub Pages (static)
이 repo의 `site/buy.html`은 **정적 페이지**라 서버 env를 읽지 못합니다.
현재는 아래 중 하나로 Polar 링크를 주입합니다:
- `buy.html` 내부에 링크를 하드코딩하거나
- query params로 주입: `/buy.html?pro=<url>&team=<url>`

### (선택) 별도 landing server (dynamic)
동적 서버를 운영한다면 환경변수로 주입하는 방식을 사용할 수 있습니다:
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

## 발급(운영자) 빠른 시작

1) RSA private key 준비(절대 커밋 금지)
2) 라이선스 키 발급:

```bash
node scripts/issue-license.js --priv ./private.pem --sub user@example.com --plan pro --days 30
```

3) 유저에게 키 전달 후 활성화 안내:

```bash
npx aiopt license activate <LICENSE_KEY>
```

## 다음 단계(서비스화)
- Polar 상품 URL 확정 후 `POLAR_PRO_URL`, `POLAR_TEAM_URL` 환경변수 설정
- 결제 완료 후 자동 발급(웹훅/스크립트) 파이프라인 연결(추후)
