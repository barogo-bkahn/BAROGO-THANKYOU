export const REWARD_POLICY={id:'rank_v2',title:'분기 순위별 칭찬포인트',tiers:[{from:1,to:1,points:30000},{from:2,to:3,points:25000},{from:4,to:5,points:20000},{from:6,to:10,points:10000}],outside:0,dayLeave:60000,equipment:50000,notice:'주고받은 칭찬을 정량·정성으로 평가해 순위를 정하고 순위에 따라 포인트를 지급합니다. 사용하지 않은 포인트는 다음 분기로 이월되며, 지급 후 1년까지만 유효합니다.',validityMonths:12};
export function rankAwards(rows){
 const sorted=rows.filter(x=>x.final!==null&&Number.isFinite(Number(x.final))).sort((a,b)=>Number(b.final)-Number(a.final));
 let last,rank=0;const awards=new Map();
 sorted.forEach((x,i)=>{if(i===0||Number(x.final)!==last)rank=i+1;last=Number(x.final);awards.set(x.employee,{rank,points:REWARD_POLICY.tiers.find(t=>rank>=t.from&&rank<=t.to)?.points??0});});
 return rows.map(x=>({...x,...(awards.get(x.employee)??{rank:null,points:0})}));
}
// These are proposed reward costs, not cash conversion or confirmed supplier SKUs.
export const CATALOG=[
 ['coffee','나를 위한 커피 한 잔','커피·간식','스타벅스 카드 1만원권 제안. 실제 카드 종류와 발급 방식은 운영 확정 후 안내해요.',10000,80,'card-starbucks'],
 ['snack','출출할 때, 간식 한 입','커피·간식','GS25 기프트카드 1만원권 제안. 실제 카드 종류와 발급 방식은 운영 확정 후 안내해요.',10000,50,'card-cvs'],
 ['oliveyoung','나를 가꾸는 시간','커피·간식','올리브영 카드 1만원권 제안. 실제 카드 종류와 발급 방식은 운영 확정 후 안내해요.',10000,40,'card-olive'],
 ['book','다음 페이지의 나','성장·학습','읽고 싶은 책을 위한 도서 지원 1만원권 제안.',10000,25,'book'],
 ['course','배워두고 싶었던 그 강의','성장·학습','업무와 관련된 온라인 강의 지원 2만원 한도 제안. 중복 지원 여부를 확인해요.',20000,20,'book'],
 ['leave-half','여유로운 반나절','휴가·리프레시','리프레시 휴가 반일(4시간) 제안. 실제 부여·사용 조건 확정 전이에요.',30000,30,'moon'],
 ['leave-day','온전히 나를 위한 하루','휴가·리프레시','리프레시 휴가 1일(8시간) 제안. 분기 1등 두 번 적립으로 교환할 수 있어요.',60000,20,'moon'],
 ['keyboard-mouse','손에 딱 맞는 마우스·키보드 세트','업무 장비','사무용 무선 마우스·키보드 세트. 9~10만원대 모델을 구매 후보로 검토해요. 모델·배열·연결 방식은 지급 전 확인해요.',50000,15,'keyboard'],
 ['usb-hub','연결 걱정 없는 USB-C 허브','업무 장비','업무용 USB-C 멀티허브 제안. 업무 PC·모니터의 포트와 출력 호환을 먼저 확인해요.',20000,20,'hub'],
 ['charger','책상 위 무선 충전기','업무 장비','휴대폰용 무선 충전 거치대 제안. 기기 호환 여부를 확인해요.',15000,20,'hub'],
 ['privacy-filter','내 화면을 지키는 보안필름','업무 장비','모니터용 시야 차단 보안필름. 24~27형 등 실제 화면 크기·화면비·부착 방식을 지급 전 확인해요. 브랜드·규격에 따라 시세 차이가 커요.',50000,15,'monitor'],
 ['tumbler','내 책상의 온도, 텀블러','기타','개인용 보온·보냉 텀블러 제안.',12000,30,'cup'],
].map(([id,name,category,description,price,stock,icon])=>({id,name,category,description,price,stock,icon}));
