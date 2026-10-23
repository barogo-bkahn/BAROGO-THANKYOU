# 실행 기록 · 2026-10-23

- Slack 앱 BAROGO THANK YOU (A0CCDGL9QHW), 바로고 워크스페이스 설치 완료.
- Supabase 프로젝트 xzyummywoqfvyhdnoyeb에 thankyou 비공개 스키마, 서버 전용 RPC 적용.
- 관리자 5명 등록. 실제 ID는 DB에만 저장.
- thankyou Edge Function 배포, Slack 서명 인증 적용, 인증 비밀값은 Edge Secrets와 암호화 설치 테이블에 저장.
- 실제 Slack Request URL Verified 확인. App Home, 관리자 검토함(빈 상태), 현재 분기 집계(빈 상태) UI 열기 성공.
- Node 테스트 16개 통과. DB verify.sql 실제 실행 PASS, 가상 데이터는 롤백.
- 매분 홈 작업 재시도, 매일 한국시간 03:15에 365일 보존 만료 정리 예약 등록.
- 반려도 월 한도 소진, 최대 365일 보존 정책 사용자 승인 완료.

남은 운영 입력: People팀 승인 직원·팀 CSV. 명부가 비어 있어 실제 칭찬 제출은 차단되어 있습니다. 실제 Slack의 정상 제출→승인→점수 반영 전체 흐름, 동시 제출/승인 부하, OAuth 재설치의 브라우저 상태 검증은 아직 완료하지 않았습니다. DB 규칙 및 요청 처리 단위 테스트 결과와 구분합니다.

최초 설치는 Slack 관리 화면에서 승인되어 발급된 봇 토큰을 암호화하여 등록했습니다. 향후 재설치용 OAuth 경로와 state 검증 코드는 구현되어 있지만 실제 OAuth 재설치 완료 테스트는 남아 있습니다.
