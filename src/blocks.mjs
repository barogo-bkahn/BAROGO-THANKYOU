export const VALUES = [
  ['breakthrough','막힘없는 해결사! · 돌파','새로운 방법으로 막힌 문제를 풀어줬어요'],
  ['altruism','동료의 든든한 지원군! · 이타심','다른 팀의 어려움도 자기 일처럼 도와줬어요'],
  ['right_choice','원칙 지킴이! · 옳은 선택','번거롭더라도 사실과 원칙에 따라 판단했어요'],
  ['optimization','비효율 해결사! · 최적화','반복되는 불편을 줄이고 일의 흐름을 개선했어요'],
  ['growth','프로학습러! · 성장','꾸준히 배우고 새로운 방법을 업무에 적용했어요'],
  ['ownership','책임감 만렙! · 오너십','맡은 일의 결과를 끝까지 확인하고 책임졌어요']
];
export const PARTICIPATION_RULE = "같은 동료에게는 분기당 한 번만 칭찬할 수 있어요.\n점수를 위해 미리 약속하고 칭찬을 주고받는 일을 줄이고, 더 다양한 동료의 좋은 행동을 발견하기 위한 규칙이에요. 실제로 고마웠던 일이 있다면 서로 칭찬하는 것은 괜찮아요.";
const participationNotes = '🧡 참여 전에 살짝 확인해주세요\n- 같은 팀도, 다른 팀도 칭찬할 수 있어요. 월별 횟수 제한은 없어요.\n- 같은 동료에게는 분기당 한 번만 보낼 수 있어요. 본인 칭찬은 할 수 없어요.\n- 실제로 고마웠던 일이 있다면 서로 칭찬해도 괜찮아요. 점수를 위해 약속한 맞칭찬은 지양해주세요.\n- 이야기는 피플팀만 확인해요. 공개 게시와 수신자 자동 알림은 없어요.\n- 불필요한 개인정보나 건강·가족 정보 등 민감한 내용은 적지 말아주세요.';
const plain = text => ({type:'plain_text',text});
const section = text => ({type:'section',text:plain(text)});
const button = (text, action_id, value) => ({type:'button',text:plain(text),action_id,...(value ? {value}: {})});
export function homeView(data, exchangeTest={}) {
  const md=text=>({type:'section',text:{type:'mrkdwn',text}});
  const context=text=>({type:'context',elements:[{type:'mrkdwn',text}]});
  const actions=[button(data.eligible?'💌 칭찬 맡기기':'💌 칭찬 안내','praise_open')];
  const test=exchangeTest.user && exchangeTest.user===exchangeTest.testUser && exchangeTest.testUrl==='http://127.0.0.1:7341';
  let exchangeUrl;
  if(typeof data.exchange_url==='string')try{const u=new URL(data.exchange_url);if(u.protocol==='https:'&&!u.username&&!u.password&&!['localhost','127.0.0.1','::1','[::1]'].includes(u.hostname))exchangeUrl=u.href;}catch{}
  // Dev stage only: a private-network http address (10.x / 192.168.x / 172.16-31.x) that opens only inside the company network.
  let lanUrl;
  if(!exchangeUrl&&typeof data.exchange_lan_url==='string')try{const u=new URL(data.exchange_lan_url);if(u.protocol==='http:'&&!u.username&&!u.password&&/^(10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})$/.test(u.hostname))lanUrl=u.href;}catch{}
  if(exchangeUrl)actions.push({...button('🎁 내 선물 고르기 ↗','exchange_open'),url:exchangeUrl});
  else if(lanUrl)actions.push({...button('🎁 칭찬교환소 열기 ↗','exchange_open'),url:lanUrl});
  else if(test)actions.push({...button('🎁 교환소 테스트하기 ↗','exchange_open'),url:exchangeTest.testUrl});
  actions.push(button('↻ 새로고침','home_refresh'));
  if(data.admin)actions.push(button('📮 비공개 접수함','review_open'),button('🧮 분기 정량 점수','scores_open'));
  const blocks=[
    {type:'header',text:plain('칭찬교환소 🧡')},
    md('*반가워요! 오늘도 고마운 동료가 떠오르나요?*\n고마움은 칭찬으로, 칭찬은 나를 위한 선물로 바꿔보세요.'),
    {type:'divider'},
    {type:'section',fields:[{type:'mrkdwn',text:'💌 *이번 분기 내가 남긴 칭찬*\n*'+(data.quarter_sent??0)+'건*'},{type:'mrkdwn',text:'💛 *이번 분기 내가 받은 칭찬*\n*'+(data.quarter_received??0)+'건*'}]},
    context('전체 접수 기준 · 분기는 1~3월 / 4~6월 / 7~9월 / 10~12월이에요.'),
    {type:'actions',block_id:'home_main_actions',elements:actions}
  ];
  if(!data.eligible)blocks.push(context('직원 계정 확인이 필요해요. 피플팀에 문의해주세요.'));
  if(lanUrl)blocks.push(context('🧪 개발 단계 테스트예요. 사내망·VPN에서만 열리고, 개발자 PC가 켜져 있을 때만 접속돼요. 가상 데이터라 실제 포인트·상품은 지급되지 않아요.'));
  else if(test&&!exchangeUrl)blocks.push(context('🧪 교환소 버튼은 나에게만 보이는 PC 테스트용이에요. 서버가 실행 중인 이 PC에서 열리며, 실제 포인트·상품은 지급되지 않아요.'));
  blocks.push({type:'divider'},md('*작은 칭찬이 선물이 되는 방법*'),
    md('💌 *좋은 행동을 발견해요*\n같은 팀·다른 팀 구분 없이, 어떤 행동이 왜 고마웠는지 핵심가치와 함께 남겨주세요.\n\n🧮 *분기마다 인정이 쌓여요*\n분기가 끝나면 정량·정성 점수를 각각 50% 반영해 포인트를 정산하고, *피플팀 관리자의 지급 승인 후* 개인에게 적립해요.\n\n🎁 *내가 원하는 선물을 골라요*\n커피·개인 간식·도서·리프레시 휴가 등, 나를 위한 혜택으로 교환해요. 잔액과 교환 내역은 교환소에서 한눈에 확인할 수 있어요.'),
    context('🌱 포인트 정산·지급과 상품 교환은 현재 테스트 준비 중이에요. 정식 오픈 일정·환산율·품목은 확정 후 안내해요. 칭찬 접수마다 포인트가 바로 지급되는 방식은 아니에요.'),
    {type:'divider'},section(participationNotes));
  return {type:'home',blocks};
}
export function praiseModal() {
  return {type:'modal',callback_id:'praise_submit',title:plain('칭찬 맡기기'),submit:plain('비공개로 맡기기'),close:plain('취소'),blocks:[
    section('반가워요! 고마운 동료의 이야기를 맡겨주세요. 💛\n누구의 어떤 행동이 고마웠는지 적어주세요. 제출하면 바로 접수돼요.'),
    {type:'input',block_id:'recipient',label:plain('칭찬할 동료'),element:{type:'users_select',action_id:'value'}},
    {type:'input',block_id:'value',label:plain('핵심가치'),element:{type:'static_select',action_id:'value',options:VALUES.map(([value,label,desc])=>({text:plain(label),value,description:plain(desc)}))}},
    {type:'input',block_id:'body',label:plain('어떤 행동이 고마웠나요?'),hint:plain('육하원칙을 참고해 ‘어떤 상황에서 → 동료가 무엇을 어떻게 했고 → 어떤 도움이 되었는지’를 적어주세요. 선택한 핵심가치와 연결되는 구체적인 행동이 잘 드러날수록 좋아요. 길이보다 내용이 중요해요! (20~2,000자)'),element:{type:'plain_text_input',action_id:'value',multiline:true,min_length:20,max_length:2000}},
    {type:'divider'},section(participationNotes)
  ]};
}
export function reviewModal(data) {
  const blocks = [section('피플팀 전용 · 전체 접수 내역을 조회하고 CSV로 내려받을 수 있어요.\n제출 즉시 접수되며 승인·반려 절차는 없어요. 내용의 충실도는 분기 정성 평가에서 판단해요.'),
    section(`전체 ${data.total??data.rows.length}건 · 최신 접수순 · 한 번에 5건씩 표시`),
    {type:'actions',elements:[button('CSV 내보내기','export_open','all')]}];
  for (const row of data.rows) blocks.push(
    {type:'divider'}, section(`발신: ${row.sender_name} → 수신: ${row.recipient_name}\n${row.sender_team} → ${row.recipient_team}\n${row.month} · ${VALUES.find(v=>v[0]===row.core_value)?.[1]??row.core_value}`),
    section(row.body),section('접수 완료 · 조회 전용')
  );
  if (!data.rows.length) blocks.push(section('접수된 칭찬이 없습니다.'));
  const navigation=[];
  if (data.next) navigation.push(button('다음 5건','review_next',JSON.stringify({cursor:data.next,filter:'all'})));
  navigation.push(button('처음으로','review_first','all'));
  blocks.push({type:'actions',elements:navigation});
  return {type:'modal',title:plain('비공개 접수함'),close:plain('닫기'),blocks};
}
export function messageModal(text) {
  return {type:'modal',title:plain('칭찬교환소'),close:plain('닫기'),blocks:[section(text)]};
}
