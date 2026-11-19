import {rankAwards} from './rewards.mjs';

// Demo-only fixture: fictional paid quarters with fictional praises, gate judgements and scores,
// so the admin view can show why each person received their quant/qual score.
// Every name, text, score and order is fictional. Idempotent through demo_versions.
const EXTRA=[['demo-e1','가상 하늘','마케팅팀'],['demo-e2','가상 도윤','영업팀'],['demo-e3','가상 서연','개발팀'],['demo-e4','가상 지후','운영팀'],['demo-e5','가상 아린','디자인팀'],['demo-e6','가상 태오','재무팀'],['demo-e7','가상 나래','CS팀'],['demo-e8','가상 시우','전략팀']];
const QUARTERS=[['2025-Q4','2026-01-12T02:00:00.000Z',[2025,10]],['2026-Q1','2026-04-13T02:00:00.000Z',[2026,1]],['2026-Q2','2026-07-13T02:00:00.000Z',[2026,4]]];
const ORDERS=[['demo-e1','coffee','2026-08-04'],['demo-e1','oliveyoung','2026-09-02'],['demo-e2','coffee','2026-08-11'],['demo-e3','course','2026-08-20'],['demo-e3','oliveyoung','2026-09-15'],['demo-e4','book','2026-09-01'],['demo-e5','coffee','2026-08-25'],['demo-e6','snack','2026-09-09'],['demo-admin','oliveyoung','2026-09-18'],['demo-member','course','2026-09-22'],['demo-jun','coffee','2026-09-25']];
export const MAXIMA=[10,20,5,30,15,10,10];
const VALUE_NAME={breakthrough:'돌파',altruism:'이타심',right_choice:'옳은 선택',optimization:'최적화',growth:'성장',ownership:'오너십'};
const CONCRETE={
 breakthrough:[['기존에는 주문 접수 지연을 사람이 하나씩 확인했는데, 원인이 접수 순서 처리 방식에 있다는 걸 찾아 처리 구조를 바꿨어요. 덕분에 피크 시간 지연 알림이 눈에 띄게 줄었어요.','기존 방식의 한계(수작업 확인)를 짚고 구조를 바꾼 행동이 구체적이며 도움도 확인됨'],['정산 오류가 매달 반복되길래 원인을 거슬러 올라가 데이터 입력 규칙 자체를 새로 정했어요. 이제 같은 유형의 오류가 다시 나오지 않아요.','반복 오류의 근본 원인을 재설계한 행동과 결과가 본문에서 추적됨'],['신규 제휴 매장 등록 절차가 복잡해서 포기하는 일이 잦았는데, 필요한 단계를 절반으로 줄인 새 흐름을 직접 만들어 시범 적용했어요.','기존 절차를 다시 설계한 구체적 행동과 시범 적용 결과가 확인됨']],
 altruism:[['처음 맡은 업무 때문에 막막해하던 신입에게 점심시간마다 사례를 같이 보며 문서화 방법을 알려줬어요. 지금은 혼자서도 보고서를 완성해요.','동료의 어려움을 챙기고 지식을 나눈 행동과 변화(혼자 완성)가 구체적임'],['다른 팀에서 급하게 데이터 추출을 요청했을 때 본인 일정을 조정해 쿼리를 같이 짜 주고 사용법까지 정리해 공유했어요.','다른 팀 문제를 자기 일처럼 도운 행동과 공유 자료가 확인됨'],['장애 대응으로 지친 팀원들을 위해 인수인계 체크리스트를 만들어 당번이 바뀌어도 누락이 없도록 도왔어요.','팀원 부담을 줄인 구체적 지원 행동과 효과가 본문에서 확인됨']],
 right_choice:[['일정이 급해서 검수를 건너뛰자는 의견이 있었지만, 고객 정산 데이터라 오차가 생기면 신뢰가 깨진다며 하루를 더 써서 검증했고 실제로 한 건의 오류를 찾았어요.','단기 편의 대신 데이터 정확성과 신뢰를 기준으로 선택한 이유와 결과가 구체적임'],['규정상 가능하더라도 고객에게 불리할 수 있는 안내 문구를 그대로 쓰지 않고 사실에 맞게 고치자고 제안해 문구를 수정했어요.','원칙에 따라 판단한 이유와 실제 수정 행동이 확인됨'],['비용을 줄일 수 있는 외주 방안이 있었지만 데이터 보안 기준에 맞지 않아 원래 계획대로 진행하자고 근거 자료와 함께 설명했어요.','장기 신뢰를 기준으로 한 판단과 근거 제시가 구체적임']],
 optimization:[['매주 손으로 합치던 현황 보고 세 가지를 하나의 자동 집계 시트로 합쳐서 매주 두 시간씩 걸리던 작업이 십 분으로 줄었어요.','반복 수작업을 구조로 개선한 행동과 줄어든 시간이 명확함'],['문의 유형이 겹쳐 같은 답변을 반복하는 문제를 분류 체계부터 다시 정리해 템플릿으로 만들었고 응대 시간이 짧아졌어요.','분류 체계와 템플릿으로 반복 비효율을 줄인 행동이 확인됨'],['배차 요청 확인 단계가 여러 번 중복되던 흐름을 점검해 불필요한 승인 단계를 없애고 담당자 안내를 새로 정리했어요.','전체 흐름의 중복 단계를 제거한 구체적 개선이 확인됨']],
 growth:[['새로 도입한 분석 도구를 쓰려고 혼자 공부하고 작은 실험을 반복하더니, 실패한 방식까지 기록해 팀에 공유하고 실제 업무 보고에 적용했어요.','새 도구 학습과 실패 공유, 업무 적용이 구체적으로 연결됨'],['피드백을 받은 발표 자료를 그 자리에서 정리해 다음 주 다시 발표했는데, 지적받은 부분을 구체적으로 고쳐 와서 이해가 훨씬 쉬워졌어요.','피드백을 반영해 개선한 행동과 결과가 본문에서 확인됨'],['처음 해보는 데이터 시각화 업무를 맡아 강의를 듣고 사내 사례로 직접 만들어 보며 팀 대시보드 초안을 완성했어요.','학습을 업무 결과물로 연결한 행동이 구체적임']],
 ownership:[['배포 후 일부 지역에서 알림이 늦게 간다는 제보가 있었는데, 담당이 아닌 상황에서도 원인을 끝까지 추적해 수정하고 결과를 제보자에게 직접 알려줬어요.','결과를 끝까지 추적하고 책임진 행동과 사후 공유가 확인됨'],['고객 문의가 여러 팀을 돌다 멈춘 건을 맡아 담당 팀과 일정 조율, 재안내까지 마무리해서 고객이 다시 문의하지 않았어요.','문제를 외면하지 않고 해결까지 책임진 행동이 구체적임'],['일정이 밀린 프로젝트의 위험 요소를 먼저 정리해 공유하고 대안 일정까지 제안해서 팀이 우선순위를 다시 잡을 수 있었어요.','위험을 먼저 드러내고 대안을 책임지고 제시한 행동이 확인됨']]
};
const VAGUE=['항상 고마웠어요! 늘 감사하는 마음이에요. 앞으로도 잘 부탁드려요.','최고예요, 늘 열정적이고 책임감 있는 분이에요. 정말 감사해요!','덕분에 많이 배웠어요. 정말 고마워요. 앞으로도 많이 도와주세요.','늘 성실해서 믿음이 가요. 항상 고맙습니다. 계속 응원할게요.'];
const OFFVALUE=[['신입이 막힐 때마다 시간을 내어 같이 문서를 보며 설명해줬어요. 덕분에 빨리 적응했어요.','altruism']];

const qMonth=(base,n)=>{let m=base[1]+(n%3),y=base[0];return `${y}-${String(m).padStart(2,'0')}`;};
function scoresFor(level,idx){return MAXIMA.map((max,k)=>{let v=Math.round(max*level/100)+((idx+k)%3===0?-1:(idx+k)%3===1?0:1);if(k===3)v=Math.max(v,max*0.55|0);return Math.max(0,Math.min(max,v));});}

// people: array of employee ids (stable order). Returns one record per quarter.
export function buildHistory(people){
 const values=Object.keys(CONCRETE);
 return QUARTERS.map(([quarter,approvedAt,base],q)=>{
  const praises=[],evals=[];let n=0;
  people.forEach((sender,i)=>{
   const sends=(i+q)%4; // at most one praise per month => up to 3 per quarter
   for(let j=0;j<sends;j++){
    const recipient=people[(i+1+j*3+q)%people.length];if(recipient===sender)continue;
    const kind=(i*7+j*5+q*3)%10,value=values[(i+j+q)%values.length],id=`hist-praise-${quarter}-${String(++n).padStart(3,'0')}`,month=qMonth(base,j),created=`${month}-${String(8+(n%18)).padStart(2,'0')}T02:00:00.000Z`;
    let body,gate,note,scores;
    if(kind<6){const [text,why]=CONCRETE[value][(i+j+q)%3];body=text;gate='pass';note=`본문에 따르면 ${why}. (핵심가치: ${VALUE_NAME[value]})`;scores=scoresFor(55+((i*13+j*7+q*11)%41),n);}
    else if(kind<9){body=VAGUE[(i+j+q)%VAGUE.length];gate='vague';note='행동 식별 불가: 감사·칭찬 표현만 있고 무엇을 했는지 확인되지 않아 게이트 0점 처리';scores=MAXIMA.map(()=>0);}
    else{const [text,fits]=OFFVALUE[0];body=text;gate='no_value';note=`행동은 확인되나 선택한 가치(${VALUE_NAME[value]})와 부합하는 근거가 없음. 다른 가치 검토 제안: ${VALUE_NAME[fits]}`;scores=MAXIMA.map(()=>0);}
    praises.push({id,sender,recipient,core_value:value,body,month:month+'-01',created_at:created});
    evals.push({settlement:'hist-'+quarter,praise_id:id,recipient,sender,scores,score:scores.reduce((a,b)=>a+b,0),gate,note});
   }
  });
  const rows=people.map(employee=>{
   const recv=evals.filter(e=>e.recipient===employee&&e.score>0),sent=evals.filter(e=>e.sender===employee&&e.score>0);
   const quant=Math.min(100,recv.length*5+(sent.length>=3?5:0)),qual=recv.length?recv.reduce((a,e)=>a+e.score,0)/recv.length:null;
   return {employee,received:recv.length,sent:sent.length,quant,qual,final:qual===null?null:(quant+qual)/2};
  });
  return {quarter,approvedAt,praises,evals,awards:rankAwards(rows)};
 });
}

export function seedHistory(db){
 db.exec('CREATE TABLE IF NOT EXISTS demo_versions(id TEXT PRIMARY KEY)');
 if(db.prepare("SELECT id FROM demo_versions WHERE id='history-v5'").get())return;
 if(db.prepare("SELECT count(*) n FROM employees WHERE id NOT LIKE 'demo-%'").get().n)throw Error('History fixture is demo-only');
 if(!db.prepare("SELECT id FROM products WHERE id='course'").get())return; // reward catalog not installed
 const run=(q,...p)=>db.prepare(q).run(...p);
 db.exec('BEGIN IMMEDIATE');try{
  // Replace the earlier (v3) fixture, which had no per-praise evidence.
  run("DELETE FROM evaluations WHERE settlement LIKE 'hist-%'");run("DELETE FROM praises WHERE id LIKE 'hist-praise-%'");
  run("DELETE FROM ledger WHERE ref LIKE 'hist:%' OR ref LIKE 'order:hist-order-%'");run("DELETE FROM orders WHERE id LIKE 'hist-order-%'");
  run("DELETE FROM awards WHERE settlement LIKE 'hist-%'");run("DELETE FROM settlements WHERE id LIKE 'hist-%'");
  for(const [id,name,team] of EXTRA)run('INSERT OR IGNORE INTO employees(id,name,team,admin) VALUES(?,?,?,0)',id,name,team);
  const people=db.prepare('SELECT id FROM employees ORDER BY id').all().map(e=>e.id);
  for(const h of buildHistory(people)){
   const sid='hist-'+h.quarter;
   run("INSERT INTO settlements(id,quarter,state,rate,scheme,approved_by,approved_at) VALUES(?,?,'paid',1,'rank_v2','demo-admin',?)",sid,h.quarter,h.approvedAt);
   for(const p of h.praises)run('INSERT INTO praises(id,sender,recipient,core_value,body,month,created_at) VALUES(?,?,?,?,?,?,?)',p.id,p.sender,p.recipient,p.core_value,p.body,p.month,p.created_at);
   for(const e of h.evals)run('INSERT INTO evaluations(settlement,praise_id,scores,score,gate,note) VALUES(?,?,?,?,?,?)',e.settlement,e.praise_id,JSON.stringify(e.scores),e.score,e.gate,e.note);
   for(const a of h.awards){
    run('INSERT INTO awards(settlement,employee,received,sent,quant,qual,final,points,rank) VALUES(?,?,?,?,?,?,?,?,?)',sid,a.employee,a.received,a.sent,a.quant,a.qual,a.final,a.points,a.rank);
    if(a.qual!==null&&a.points>0)run('INSERT INTO ledger(id,employee,amount,kind,ref,note,created_at) VALUES(?,?,?,?,?,?,?)',`hist-l-${h.quarter}-${a.employee}`,a.employee,a.points,'credit',`hist:${h.quarter}:${a.employee}`,`${h.quarter.replace(/^(\d{4})-Q(\d)$/,'$1년 $2분기')} 칭찬포인트`,h.approvedAt);
   }
  }
  ORDERS.forEach(([employee,product,day],n)=>{
   const p=db.prepare('SELECT * FROM products WHERE id=?').get(product),id='hist-order-'+(n+1),at=day+'T03:00:00.000Z';
   const bal=db.prepare('SELECT coalesce(sum(amount),0) b FROM ledger WHERE employee=?').get(employee).b;
   if(bal<p.price)return;
   run("INSERT INTO orders(id,employee,product,product_name,cost,state,request_id,created_at,completed_at,balance_after) VALUES(?,?,?,?,?,'fulfilled',?,?,?,?)",id,employee,p.id,p.name,p.price,'hist-request-'+(n+1)+'-0000',at,day+'T08:00:00.000Z',bal-p.price);
   run('INSERT INTO ledger(id,employee,amount,kind,ref,note,created_at) VALUES(?,?,?,?,?,?,?)',`hist-l-order-${n+1}`,employee,-p.price,'redeem','order:'+id,p.name,at);
  });
  run("INSERT INTO demo_versions(id) VALUES('history-v5')");db.exec('COMMIT');
 }catch(e){db.exec('ROLLBACK');throw e;}
}
