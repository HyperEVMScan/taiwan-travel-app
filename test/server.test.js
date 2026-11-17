'use strict';
const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
let server,base,dir;
before(async()=>{dir=await fs.mkdtemp(path.join(os.tmpdir(),'moatrip-test-'));process.env.DATA_DIR=dir;const {createServer}=require('../server');server=createServer();await new Promise(ok=>server.listen(0,'127.0.0.1',ok));base=`http://127.0.0.1:${server.address().port}`;});
after(async()=>{if(server)await new Promise(ok=>server.close(ok));if(dir)await fs.rm(dir,{recursive:true,force:true});});
async function call(url,method='GET',body){const res=await fetch(base+url,{method,headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});return {status:res.status,...await res.json()};}
const sample={title:'여행 테스트',destination:'서울, 대한민국',startDate:'2026-11-17',dayCount:4};
let id,placeId1,placeId2;
test('health 상태 및 설정 조회',async()=>{const h=await call('/api/health');assert.equal(h.status,200);assert.equal(h.storage,'local');const cfg=await call('/api/config');assert.equal(cfg.status,200);assert.equal(cfg.googleMapsKey,'');});
test('새 여행 생성 및 조회',async()=>{const r=await call('/api/trips','POST',sample);assert.equal(r.status,201);assert.equal(r.trip.dayCount,4);id=r.trip.id;assert.match(id,/^[0-9a-f]{32}$/);assert.equal((await call('/api/trips/'+id)).trip.title,sample.title);});
test('잘못된 날짜와 기간 거절',async()=>{assert.equal((await call('/api/trips','POST',{...sample,startDate:'2026-02-31'})).status,400);assert.equal((await call('/api/trips','POST',{...sample,dayCount:0})).status,400);assert.equal((await call('/api/trips','POST',{...sample,dayCount:31})).status,400);});
test('여행 메타 수정',async()=>{const r=await call('/api/trips/'+id,'PATCH',{title:'서울 3박4일',description:'메모입니다'});assert.equal(r.status,200);assert.equal(r.trip.title,'서울 3박4일');assert.equal(r.trip.version,2);});
test('장소 2개 추가, 순서 유지',async()=>{let r=await call('/api/trips/'+id+'/places','POST',{day:0,name:'서울역',address:'중구',lat:37.55,lng:126.97,category:'transport',time:'10:00',note:'출발'});assert.equal(r.status,201);placeId1=r.place.id;r=await call('/api/trips/'+id+'/places','POST',{day:0,name:'광화문',address:'종로구',lat:37.571,lng:126.976});assert.equal(r.status,201);placeId2=r.place.id;assert.equal(r.trip.places.length,2);});
test('위치가 없거나 잘못된 날짜의 장소 추가 거절',async()=>{assert.equal((await call('/api/trips/'+id+'/places','POST',{name:'누락',day:0})).status,400);assert.equal((await call('/api/trips/'+id+'/places','POST',{name:'범위초과',day:8,lat:37,lng:127})).status,400);});
test('장소 수정 및 날짜 이동',async()=>{const r=await call('/api/trips/'+id+'/places/'+placeId2,'PATCH',{name:'경복궁',day:1,note:'입장권 사기',time:'13:10'});assert.equal(r.status,200);const p=r.trip.places.find(x=>x.id===placeId2);assert.equal(p.name,'경복궁');assert.equal(p.day,1);assert.equal(p.time,'13:10');});
test('남아 있는 장소가 있는 여행 기간 축소 방지',async()=>{const r=await call('/api/trips/'+id+'/PATCH','POST',{});assert.equal(r.status,404);assert.equal((await call('/api/trips/'+id,'PATCH',{dayCount:1})).status,400);});
test('장소 순서 변경 및 유효하지 않은 순서 거절',async()=>{const add=await call('/api/trips/'+id+'/places','POST',{name:'덕수궁',day:0,lat:37.565,lng:126.976});const newId=add.place.id;const ok=await call('/api/trips/'+id+'/reorder','POST',{day:0,ids:[newId,placeId1]});assert.equal(ok.status,200);assert.equal(ok.trip.places.find(x=>x.day===0).id,newId);assert.equal((await call('/api/trips/'+id+'/reorder','POST',{day:0,ids:[newId,newId]})).status,409);});
test('삭제 후 다시 조회할 때 영속 저장 유지',async()=>{const r=await call('/api/trips/'+id+'/places/'+placeId1,'DELETE');assert.equal(r.status,200);const saved=await call('/api/trips/'+id);assert.equal(saved.status,200);assert.equal(saved.trip.places.some(x=>x.id===placeId1),false);});
test('가져오기에서 새로운 여행 ID가 부여됨',async()=>{const exported=await call('/api/trips/'+id);const r=await call('/api/trips/import','POST',{trip:exported.trip});assert.equal(r.status,201);assert.notEqual(r.trip.id,id);assert.equal(r.trip.places.length,exported.trip.places.length);assert.notEqual(r.trip.places[0].id,exported.trip.places[0].id);});
test('유효하지 않은 ID 조회 및 안전한 정적 파일 처리',async()=>{const no=await call('/api/trips/'+'a'.repeat(32));assert.equal(no.status,404);const r=await fetch(base+'/');assert.equal(r.status,200);assert.match(await r.text(),/모아트립/);const js=await fetch(base+'/app.js');assert.equal(js.status,200);assert.match(js.headers.get('content-type'),/javascript/);});

test('대만 장소 검색: 한국어·한자·영어 표기를 같은 장소로 찾음',async()=>{
  const q=async term=>call('/api/search?q='+encodeURIComponent(term));
  for(const term of ['지우펀','九份','Jiufen']){
    const r=await q(term);assert.equal(r.status,200);assert.equal(r.results[0].name,'지우펀 옛거리');
    assert.ok(r.results[0].lat>20&&r.results[0].lat<27);
  }
  const r=await q('101');assert.ok(r.results.some(p=>p.name==='타이베이 101'));
});
test('대만 장소 검색은 2글자 미만일 때 외부 요청하지 않음',async()=>{
  const r=await call('/api/search?q=%E3%81%82');assert.equal(r.status,200);assert.deepEqual(r.results,[]);
});
test('대만 여행 예시를 가져오고 DAY 1~4 정보 유지',async()=>{
  const b={title:'대만 3박4일',destination:'타이베이, 대만',startDate:'2026-12-01',dayCount:4,
    places:[{day:0,name:'시먼딩',lat:25.04218,lng:121.50711},
            {day:1,name:'타이베이 101',lat:25.03397,lng:121.56447},
            {day:2,name:'지우펀 옛거리',lat:25.109187,lng:121.846298},
            {day:3,name:'타오위안 국제공항',lat:25.07639,lng:121.22389}]};
  const r=await call('/api/trips/import','POST',{trip:b});assert.equal(r.status,201);
  assert.deepEqual(r.trip.places.map(p=>p.day),[0,1,2,3]);
  assert.equal(r.trip.places.length,4);
});
test('공유 여행 변경이 다른 연결에 SSE로 실시간 전달됨',async()=>{
  const r=await call('/api/trips','POST',sample);
  const tripId=r.trip.id;
  const controller=new AbortController();
  const stream=await fetch(base+'/api/trips/'+tripId+'/events',{signal:controller.signal});
  assert.equal(stream.status,200);
  assert.match(stream.headers.get('content-type'),/text\/event-stream/);
  const reader=stream.body.getReader();
  try {
    const first=await reader.read();
    assert.match(new TextDecoder().decode(first.value),/connected/);
    const add=await call('/api/trips/'+tripId+'/places','POST',{day:0,name:'타이베이 101',lat:25.03397,lng:121.56447});
    assert.equal(add.status,201);
    const event=await Promise.race([
      reader.read(),
      new Promise((_,reject)=>setTimeout(()=>reject(new Error('SSE timeout')),2500))
    ]);
    const message=new TextDecoder().decode(event.value);
    assert.match(message,/event: trip/);
    assert.match(message,/타이베이 101/);
  } finally {
    controller.abort();
    await reader.cancel().catch(()=>{});
  }
});

const {parseQuickText,orderedInsert}=require('../lib/quick-add');
test('사진 메모: 셋째날 오전 8시 첫 주먹밥 맛집 판별',()=>{
  const trip={startDate:'2026-07-21',dayCount:4};
  const p=parseQuickText('여기 7/23 셋째날 처음 갈곳 시간은 8시쯤. 주먹밥 맛집임 // 근처에 총촤빙 맛집 있다고함',trip,0);
  assert.equal(p.day,2);assert.equal(p.time,'08:00');assert.equal(p.category,'food');assert.equal(p.kind,'plan');assert.equal(p.priority,'first');
});
test('근처 후보는 정확히 분류하고 일자 자동 인식, 오후 8시는 20시',()=>{
  const trip={startDate:'2026-11-21',dayCount:4};
  const p=parseQuickText('Day 2 오후 8시 소품샵 근처 후보 저장만',trip,0);
  assert.equal(p.day,1);assert.equal(p.time,'20:00');assert.equal(p.category,'shopping');assert.equal(p.kind,'candidate');
  assert.equal(parseQuickText('11/24 오후 3시 카페',trip,0).day,3);
});
test('자동 동선 삽입: 08:00, 12:00, 17:00 시간순 및 첫 코스 우선',()=>{
  const ps=[{day:2,time:'12:00',lat:25.02,lng:121.5,kind:'plan',name:'점심'}, {day:2,time:'17:00',lat:25.04,lng:121.6,kind:'plan',name:'저녁'}];
  orderedInsert(ps,{day:2,time:'08:00',lat:25.01,lng:121.51,kind:'plan',name:'아침'},'auto');
  assert.deepEqual(ps.map(p=>p.name),['아침','점심','저녁']);
  orderedInsert(ps,{day:2,time:'',lat:25.0,lng:121.5,kind:'plan',name:'첫 방문'},'first');
  assert.equal(ps[0].name,'첫 방문');
  orderedInsert(ps,{day:2,time:'',lat:25.01,lng:121.52,kind:'candidate',name:'소품샵'},'auto');
  assert.equal(ps.at(-1).name,'소품샵');
});
test('빠른 입력: 저장소와 검색을 통해 별도 API 키 없이 여행 일정 추가',async()=>{
  const r=await call('/api/trips','POST',{...sample,title:'대만 여행 빠른 추가',destination:'대만'});const tid=r.trip.id;
  const preview=await call('/api/trips/'+tid+'/quick-preview','POST',{name:'타이베이 101',note:'3일째 오전 8시 첫 방문, 관광',activeDay:0,kind:'candidate'});
  assert.equal(preview.status,200);
  assert.equal(preview.draft.day,2);assert.equal(preview.draft.time,'08:00');assert.equal(preview.draft.kind,'candidate');
  assert.ok(preview.matches.some(x=>x.name==='타이베이 101'));
  const location=preview.matches[0];
  const add=await call('/api/trips/'+tid+'/places','POST',{day:preview.draft.day,name:location.name,lat:location.lat,lng:location.lng,kind:'candidate',category:'spot',smartOrder:true});
  assert.equal(add.status,201);assert.equal(add.place.kind,'candidate');
  assert.equal((await call('/api/trips/'+tid)).trip.places[0].kind,'candidate');
});
test('사진 분석 설정이 없으면 설명하는 오류 반환 및 잘못된 사진 입력 거절',async()=>{
  const trip=await call('/api/trips','POST',sample);const url='/api/trips/'+trip.trip.id+'/quick-preview';
  const wrong=await call(url,'POST',{image:'data:image/svg+xml;base64,aGVsbG8=',note:'여기'});
  assert.equal(wrong.status,400);
  const photo=await call(url,'POST',{image:'data:image/png;base64,'+'a'.repeat(300),note:'여기 오후 3시'});
  assert.equal(photo.status,422);assert.match(photo.error,/GEMINI_API_KEY/);
  const manual=await call(url,'POST',{name:'시먼딩',image:'data:image/jpeg;base64,'+'a'.repeat(300),note:'둘째날 13시'});
  assert.equal(manual.status,200);assert.equal(manual.draft.day,1);
});
test('정식 일정 자동 시간순 추가와 후보 핀 정보를 API가 유지',async()=>{
  const r=await call('/api/trips','POST',sample);const tid=r.trip.id;
  const add=(name,time,kind='plan',priority='auto')=>call('/api/trips/'+tid+'/places','POST',{name,day:2,time,kind,priority,smartOrder:true,category:kind==='candidate'?'shopping':'food',lat:25.041,lng:121.51});
  await add('점심','12:00');await add('저녁','18:00');await add('아침','08:00');await add('근처 쇼핑','', 'candidate');
  const places=(await call('/api/trips/'+tid)).trip.places;
  assert.deepEqual(places.map(p=>p.name),['아침','점심','저녁','근처 쇼핑']);
  assert.equal(places[3].kind,'candidate');
  const edited=await call('/api/trips/'+tid+'/places/'+places[3].id,'PATCH',{kind:'plan'});
  assert.equal(edited.status,200);assert.equal(edited.trip.places[3].kind,'plan');
});

test('v1.3.0 한국어 벡터 지도가 기본으로 연결되고 실패 시 기존 지도를 유지',()=>{
  const fs=require('node:fs');
  const html=fs.readFileSync(require('node:path').join(__dirname,'../public/index.html'),'utf8');
  const app=fs.readFileSync(require('node:path').join(__dirname,'../public/app.js'),'utf8');
  assert.match(html,/maplibre-gl@4\.7\.1/);
  assert.match(html,/maptoolkitLogo/);
  assert.match(app,/summer-ko\.json/);
  assert.match(app,/name_ko/);
  assert.match(app,/name:ko/);
  assert.match(app,/name_en/);
  assert.match(app,/installKoreanBasemap\(raster\)/);
  assert.match(app,/state\.map\.hasLayer\(raster\)/);
});
