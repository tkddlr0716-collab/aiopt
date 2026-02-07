# Ops SOP (Option B) — Renewal without product server

Goal: 월 구독 결제를 유지하면서도, 제품은 **오프라인 서명 라이선스 키**로 운영한다.

## What we automate vs. what we keep manual
- **Automated**: Polar가 결제/구독 상태를 관리
- **Manual/Batch**: 분기(90일) 또는 연(12개월) 단위로 키를 발급/전달

## Issuance (operator)
### Fastest (local)
```bash
node scripts/issue-license.js --priv ./private.pem --sub customer@email --plan pro --months 3
```

### Safer (GitHub Actions)
- repo secret에 `RSA_PRIVKEY_PEM` 저장
- Actions → `issue-license` workflow_dispatch 실행
- artifact(`license.txt`) 다운로드 후 구매자에게 전달

## Delivery templates
### (1) 구매 직후 안내 템플릿

제목: AIOpt 라이선스 키 안내

안녕하세요! 구매 감사합니다.
아래 라이선스 키를 프로젝트 폴더에서 활성화해 주세요.

LICENSE_KEY:
<붙여넣기>

활성화:
```bash
npx aiopt install --force
npx aiopt license activate <LICENSE_KEY>
npx aiopt license status
```

만료 정책(Option B): 월 구독이지만 키는 보통 분기/연 단위로 발급되며, 만료 전에 새 키를 전달드립니다.

### (2) 만료 14일 전 갱신 템플릿

제목: AIOpt 라이선스 갱신 안내

안녕하세요! 라이선스 만료가 임박했습니다.
구독이 유지 중이라면 아래 새 키로 갱신해 주세요.

NEW_LICENSE_KEY:
<붙여넣기>

갱신:
```bash
npx aiopt license activate <NEW_LICENSE_KEY>
```

## Quarterly renewal checklist
- [ ] Polar에서 active subscribers 추출
- [ ] sub 식별자(이메일) 매칭
- [ ] 90일 키 일괄 발급
- [ ] 템플릿으로 일괄 전달
- [ ] 전달 로그 보관(스프레드시트/노션 등)

## Notes
- private key는 절대 repo에 커밋하지 않는다.
- 오프라인 제품이라 “미납 즉시 차단” 대신, 갱신 키 미발급으로 운영한다.
