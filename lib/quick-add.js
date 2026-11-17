'use strict';
const DAY_WORDS={첫째날:0,첫날:0,둘째날:1,셋째날:2,넷째날:3,다섯째날:4,여섯째날:5,일곱째날:6};
const CATEGORIES=['spot','food','cafe','hotel','shopping','transport'];
function parseQuickText(text, trip, initialDay=0){
  const input=String(text||'').slice(0,1800);
  let day=Number.isInteger(initialDay)&&initialDay>=0&&initialDay<trip.dayCount?initialDay:0;
  const numeric=input.match(/\bday\s*(\d{1,2})\b|\b(\d{1,2})\s*(?:일차|째\s*날|일째)/i);
  const word=Object.entries(DAY_WORDS).find(([name])=>input.includes(name));
  if(numeric){const n=Number(numeric[1]||numeric[2])-1;if(n>=0&&n<trip.dayCount)day=n;}
  else if(word&&word[1]<trip.dayCount)day=word[1];
  else {
    const m=input.match(/\b(\d{1,2})\s*[\/.월-]\s*(\d{1,2})\s*일?\b/);
    if(m){const d=new Date(`${trip.startDate}T12:00:00`);for(let i=0;i<trip.dayCount;i++){const dayDate=new Date(d);dayDate.setDate(d.getDate()+i);if(dayDate.getMonth()+1===Number(m[1])&&dayDate.getDate()===Number(m[2])){day=i;break;}}}
  }
  let time='';
  const t24=input.match(/(?:오전|오후|아침|저녁|밤|낮)?\s*(\d{1,2})\s*:\s*(\d{2})\s*(?:쯤|경|분)?/);
  const tKo=input.match(/(오전|오후|아침|저녁|밤|낮)?\s*(\d{1,2})\s*시\s*(?:(\d{1,2})\s*분)?/);
  const hit=t24||tKo;
  if(hit){let hr=Number(t24?t24[1]:tKo[2]);const min=Number(t24?t24[2]:(tKo[3]||0));const prefix=(input.slice(Math.max(0,hit.index-4),hit.index+hit[0].length).match(/오전|오후|아침|저녁|밤|낮/)||[])[0]||'';
    if((prefix==='오후'||prefix==='저녁'||prefix==='밤')&&hr<12)hr+=12;
    if((prefix==='오전'||prefix==='아침')&&hr===12)hr=0;
    if(hr<24&&min<60)time=`${String(hr).padStart(2,'0')}:${String(min).padStart(2,'0')}`;
  }
  const first=/((?:첫|맨\s*첫)\s*(?:번째|코스|일정|갈\s*곳|방문|장소)|처음\s*갈\s*곳|제일\s*먼저|첫\s*코스)/.test(input);
  const candidate=/(?:근처\s*(?:후보|핀|찜)|후보\s*장소|일정\s*밖|시간\s*미정|저장만|나중에\s*갈|들러볼\s*후보)/.test(input);
  let category='spot';
  if(/주먹밥|맛집|식당|음식점|아침\s*식사|점심|저녁\s*식사|밥집|국수|딤섬|훠궈|총좌빙|볶음밥|레스토랑/.test(input))category='food';
  else if(/카페|커피|버블티|디저트|간식|빙수|빵집|베이커리|음료/.test(input))category='cafe';
  else if(/소품샵|쇼핑|편집샵|쇼핑몰|물건|마트|시장|기념품|잡화점|백화점/.test(input))category='shopping';
  else if(/호텔|숙소|게스트하우스/.test(input))category='hotel';
  else if(/공항|기차|지하철|버스정류장|역에서/.test(input))category='transport';
  return {day,time,priority:first?'first':'auto',kind:candidate?'candidate':'plan',category,note:input};
}
function haversine(a,b){const rad=Math.PI/180;const dlat=(b.lat-a.lat)*rad,dlng=(b.lng-a.lng)*rad,latA=a.lat*rad,latB=b.lat*rad;return 6371*2*Math.asin(Math.sqrt(Math.sin(dlat/2)**2+Math.cos(latA)*Math.cos(latB)*Math.sin(dlng/2)**2));}
function orderedInsert(places,place,priority='auto'){
  const same=places.filter(p=>p.day===place.day&&p.kind!=='candidate');
  const target=place.kind==='candidate'?places.length:null;
  if(target!==null){places.push(place);return places;}
  if(!same.length){places.push(place);return places;}
  let position=same.length;
  if(priority==='first')position=0;
  else if(priority==='last')position=same.length;
  else if(place.time){position=same.findIndex(p=>!p.time||p.time>place.time);if(position<0)position=same.length;}
  else{
    // Unknown-time stops are inserted by minimal added straight-line distance,
    // without disrupting explicitly timed stops. This is only a heuristic, not real routing.
    const lastTimed=same.reduce((acc,p,i)=>p.time?i+1:acc,0);
    let best=Infinity;position=same.length;
    for(let i=lastTimed;i<=same.length;i++){
      const prev=i?same[i-1]:null,next=i<same.length?same[i]:null;
      const cost=(prev?haversine(prev,place):0)+(next?haversine(place,next):0)-(prev&&next?haversine(prev,next):0);
      if(cost<best){best=cost;position=i;}
    }
  }
  const before=same[position];
  if(before){places.splice(places.indexOf(before),0,place);return places;}
  const last=same[same.length-1];places.splice(places.indexOf(last)+1,0,place);return places;
}
function validKind(v){return v==='candidate'?'candidate':'plan';}
function validPriority(v){return ['auto','first','last'].includes(v)?v:'auto';}
module.exports={parseQuickText,orderedInsert,validKind,validPriority,CATEGORIES,haversine};
