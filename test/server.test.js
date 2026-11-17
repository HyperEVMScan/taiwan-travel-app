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
