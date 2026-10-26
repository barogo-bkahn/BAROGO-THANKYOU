# 바로고 THANK YOU

직원은 Slack 앱 하나만 사용합니다. 데이터 저장과 서버 처리는 기존 Supabase 프로젝트에서 실행합니다. 별도 서버·도메인은 필요하지 않습니다.

## 제공 기능

- App Home에서 월 1회 다른 팀 동료 칭찬. 동료·본문·핵심가치 6개 입력.
- 피플팀 비공개 접수·승인·반려. 관리자 본인 발신·수신 건은 다른 관리자가 검토.
- 공개 채널 자동 게시와 수신자 알림 없음. 메시지 발송 권한도 요청하지 않음.
- 한국시간 월 중복 제한. 반려도 월 한도 사용(확정).
- 승인 수신 건당 5점, 제출 분기 내 승인 발신 3건 달성 시 분기당 1점.
- 피플팀 CSV의 직원·조직 정보로 검증. part1은 무시. 발신자 part3가 있으면 수신자 part3와 비교하고, 없으면 part2끼리 비교하여 같은 경우 차단. 빈칸과 -는 미입력으로 처리.
- 승인된 칭찬·검토·감사 이력 최대 365일 보존 후 삭제(확정). 삭제 시 해당 원본 기반 점수도 제거.

## 간단한 배포

이 저장소의 index.ts는 의존성 없이 배포 가능한 단일 Edge Function입니다. secrets와 직원·관리자 실제 명부는 공개 저장소에 포함하지 않습니다.

1. 지정 Supabase SQL Editor에서 schema.sql 실행. 기존 앱 테이블이 없는 프로젝트용 초기 SQL이며 재실행하지 않습니다.
2. verify.sql 실행. 가상 직원으로 DB 제약·권한·점수를 검증하고 전부 롤백합니다.
3. 관리자 명부 thankyou.admins에 승인된 Slack 사용자 ID를 입력합니다. 직원 명부는 slack_user_id,name,part1,part2,part3 열(선택적으로 active)을 가진 CSV로 roster.mjs를 이용해 검증된 SQL로 변환합니다. 명부에 없는 직원은 차단되며, 누락된 기존 직원은 자동 퇴사 처리되지 않습니다.
4. Supabase Edge Functions에서 thankyou 함수를 만들고 index.ts를 배포합니다. Supabase의 legacy JWT 검사는 끄고, 코드가 Slack 원문 HMAC 서명과 timestamp를 검증합니다. 이 설정을 바꾸기 전 실제 서명 검증 코드가 배포되었는지 확인합니다.
5. Edge Secrets에 SLACK_CLIENT_ID, SLACK_CLIENT_SECRET, SLACK_SIGNING_SECRET, TOKEN_ENCRYPTION_KEY(무작위 32바이트 base64), INSTALL_PASSWORD(무작위 24자 이상), WORKER_SECRET(무작위 32바이트 이상)을 설정합니다. SUPABASE_URL과 SUPABASE_SERVICE_ROLE_KEY는 런타임 기본 비밀값을 사용합니다. 키를 채팅이나 저장소에 붙이지 않습니다.
6. Slack 앱을 만들고 manifest.json을 사용합니다. 실제 URL은 아래와 같습니다. App Home을 활성화하고 messages 탭은 끕니다. Bot scope는 users:read뿐입니다.

```text
Events: https://xzyummywoqfvyhdnoyeb.supabase.co/functions/v1/thankyou/slack/events
Interactivity: https://xzyummywoqfvyhdnoyeb.supabase.co/functions/v1/thankyou/slack/interactions
OAuth callback: https://xzyummywoqfvyhdnoyeb.supabase.co/functions/v1/thankyou/slack/oauth/callback
Install: https://xzyummywoqfvyhdnoyeb.supabase.co/functions/v1/thankyou/slack/install
```

7. Install 주소를 열고 사용자명 install과 설치 비밀번호로 인증합니다. Slack 권한 승인은 워크스페이스 관리자가 진행합니다. 지정 바로고 워크스페이스 및 피플팀 관리자만 설치할 수 있습니다.
8. Vault에 WORKER_SECRET과 동일한 값을 thankyou_worker_secret 이름으로 저장하고 schedule.sql로 홈 갱신 재시도(매분)와 보존 삭제(한국시간 매일 03:15)를 예약합니다. 중복 예약하지 않습니다. 삭제 작업 예약은 보존정책 승인 후 수행합니다.
9. acceptance.md대로 실제 Slack 접수·중복·승인·권한 및 알림 미발송을 테스트합니다. 비밀값과 직원 명부가 없으면 실제 운영 준비가 끝난 상태가 아닙니다.

## 접근권한·삭제·운영

전체 칭찬은 DB 관리자와 지정 피플팀 관리자만 접근합니다. 일반 직원은 자신의 월 제출 상태·분기 제출 건수·분기 승인 수신 건수만 볼 수 있으며, 받은 칭찬의 본문·작성자 조회 화면은 없습니다. 앱 테이블은 비공개 thankyou 스키마, RLS 활성화, anon/authenticated 권한 없음으로 구성합니다. public.ty_api는 service_role만 실행합니다. 서비스 키 보유자는 RLS를 우회하므로 키를 서버 비밀 저장소 밖으로 노출하지 않습니다.

Slack 요청은 원문 body HMAC-SHA256와 5분 창으로 검증합니다. OAuth state는 HttpOnly/Secure 쿠키와 DB 해시로 연결하고 10분 만료·1회 소비합니다. 봇 토큰은 WebCrypto AES-GCM으로 암호화해 저장합니다. 본문·검토사유·원문 payload·토큰·OAuth code는 로그에 남기지 않습니다. 읽기·승인 이력은 감사 테이블에 기록합니다.

퇴사자는 직원·관리자 명부 모두 active=false로 반영합니다. 피플팀 직원 명부 원본도 갱신합니다. 개인 삭제는 erase-person.sql 예제로 대상·점수 영향·보존 의무 확인 후 수행합니다. 백업·내보내기에도 만료 정책을 적용하고 복원 시 삭제 요청을 재적용해야 합니다. 새 명부 수입으로 삭제자를 재생성하지 않도록 원본에서도 제외합니다.

홈 갱신은 DB 큐에 저장하고 EdgeRuntime.waitUntil로 실행하며 매분 미완료 작업을 재시도합니다. 5회 실패한 작업을 모니터링합니다. 모달은 2.4초 처리 창을 두며 응답 유실 시 같은 view ID를 재시도하므로 DB 중복이 생기지 않습니다. 실제 Slack의 3초 응답 제한과 콜드 스타트는 배포 후 측정해야 합니다.

현재 분기 관리자 점수 화면은 95명까지 표시합니다. 전체·과거 분기 결과는 운영 담당자가 SQL로 내보냅니다. 늦은 승인도 제출 분기에 반영됩니다. 분기 확정 잠금, 승인 취소, 이의신청과 급여 연계는 별도 범위입니다. 피플팀의 인사 결정을 자동화하지 않습니다.

## 개발·검증

전체 모듈 소스는 source.zip에 포함합니다. Node 24에서 node --test로 단위/요청 처리를 검증하고 node scripts/build-edge.mjs로 index.ts를 재생성합니다. verify.sql과 acceptance.md는 실제 DB·Slack 검증 절차입니다. 테스트 절차와 실제 실행 결과를 구분해 관리합니다.

공식 문서: [Supabase Edge 배포](https://supabase.com/docs/guides/functions/quickstart-dashboard), [백그라운드 처리](https://supabase.com/docs/guides/functions/background-tasks), [Slack 서명](https://docs.slack.dev/authentication/verifying-requests-from-slack/), [Slack OAuth](https://docs.slack.dev/authentication/installing-with-oauth/).

## 조직 판정 규칙

발신자의 part3가 있으면 수신자의 part3와 비교합니다. 발신자의 part3가 비어 있으면 수신자의 part2와 비교합니다. part1은 사용하지 않습니다. 방향별 판정이 달라질 수 있습니다. part2·part3가 모두 없는 발신자는 기준 보완 전 제출을 차단합니다. 같은 팀 표시 문자열을 비교하는 예전 제약은 제거하고 DB의 thankyou.same_org 함수로 검증합니다. 기존 프로젝트는 update-part-rules.sql을 적용합니다. 조직 정보는 제출 시점의 표기를 접수 건에 보존합니다.

피플팀이 지정한 조직 제한 예외자는 본인 제외 전체 직원에게 추천할 수 있습니다. 예외는 DB 직원 레코드의 org_exempt로 명시하며 월 한도·자기 추천 차단·관리자 승인을 우회하지 않습니다. 개인별 예외 명부는 공개 코드에 포함하지 않습니다.

관리자 검토함은 본인 발신·수신 건과 처리 완료 건을 포함한 전체 접수를 조회합니다. 상태를 표시하고, 본인 발신·수신 건 및 처리 완료 건에는 승인·반려 버튼이 없습니다. 서버에서도 본인 건 처리를 차단합니다. 기존 설치에는 db/update-admin-visibility.sql (배포 묶음에서는 update-admin-visibility.sql)과 갱신된 index.ts를 적용합니다.

## 홈 현황·검토함·CSV (2026-10-26)

홈은 이번 달 제출 여부와 상태, 이번 분기 접수한 칭찬 건수, 이번 분기 승인된 수신 건수를 표시합니다. 분기는 한국시간 달력 기준이며 늦은 승인도 제출 분기에 귀속됩니다. 새로고침 버튼으로 현재 값을 불러옵니다. 홈과 모달의 팀 표기는 피플팀으로 통일합니다.

검토함은 최신 접수순 5건씩, 전체·검토 대기·승인·반려 필터와 전체 상태별 건수를 제공합니다. 다음 5건은 생성시각+접수번호 기준으로 이어지며, 처음으로 버튼은 선택한 필터의 최신 페이지로 돌아갑니다. 본인 작성·수신 건은 조회 전용이고 다른 피플팀 관리자만 승인·반려합니다. 일반 직원은 버튼 숨김과 서버 권한 검사로 접근을 차단합니다.

검토함 → CSV 내보내기 → CSV 다운로드로 선택한 상태의 보존 중인 전체 내역을 내려받습니다. 현재 페이지의 5건에 제한되지 않습니다. 16개 열은 접수번호, 접수일시(KST), 귀속월, 처리상태, 작성자/Slack ID/조직, 수신자/Slack ID/조직, 핵심가치 코드·표시명, 칭찬 내용, 검토자, 검토일시(KST), 검토 사유입니다. 귀속월로 Excel에서 분기를 필터링할 수 있습니다. UTF-8 BOM, 쉼표·줄바꿈·따옴표 인코딩 및 수식 주입 방어를 적용합니다.

다운로드 링크는 지정 관리자만 발급할 수 있고, 내려받는 시점에도 발급자의 현재 관리자 권한을 확인합니다. 링크를 소지하면 내려받을 수 있으므로 외부에 공유하지 않습니다. 링크는 무작위 256비트, DB에는 해시만 저장, 5분 만료·1회 사용입니다. 응답은 no-store/attachment이며 다운로드 감사 이력을 남깁니다. 만료 티켓은 매분 worker에서 정리합니다. CSV 파일에는 본문이 있으므로 피플팀 내부 보관 및 기존 365일 보존·삭제 정책을 적용해야 합니다.

기존 설치는 update-home-review-export.sql과 갱신된 index.ts를 배포합니다. 신규 설치는 schema.sql에 모두 포함됩니다. 비밀값·실제 명부·실제 CSV는 공개 저장소에 포함하지 않습니다.

테스트 한도 해제는 기존 접수의 quota_waived를 명시적으로 지정하여 추가 1건을 허용합니다. 기존 칭찬·승인·감사 이력과 분기 집계는 보존됩니다. 신규 접수에는 기본값 false가 적용되어 같은 달 다시 한도가 소진됩니다. 일반 직원은 이 값을 변경할 수 없고 지정 사용자·당월 한도 해제는 운영자가 개별 요청에 따라 수행하고 감사 이력을 남깁니다. 다음 달은 기본 월 1회로 돌아갑니다. 기존 설치에는 update-test-quota.sql을 적용합니다.

칭찬하기는 항상 표시합니다. 제출 가능할 때는 강조 버튼으로, 월 한도 소진 시에는 잠금 표시와 다음 달 참여 안내를 제공합니다. Slack 버튼에는 native disabled 상태가 없어 잠금 버튼을 누르면 안내 모달만 열리며, 작성창과 실제 제출 모두 서버의 현재 한도를 재검증합니다.


핵심가치 선택지는 친근한 별명과 공식 한글명을 함께 표시합니다. DB의 thankyou.core_values가 code·공식 영문명·공식 한글명·별명·행동 설명을 연결하며 praises.core_value는 이 코드에 외래키로 연결됩니다. 기존 칭찬의 핵심가치 코드는 바꾸지 않습니다. CSV는 핵심가치 코드와 표시명을 별도 열로 제공합니다(16개 열). 기존 설치에는 update-core-value-aliases.sql과 최신 index.ts를 적용합니다.

