'use strict';
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

const ROOT = __dirname;
const PUBLIC = path.join(ROOT, 'public');
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(ROOT, 'data'));
const TURSO_URL = process.env.TURSO_DATABASE_URL || '';
const TURSO_TOKEN = process.env.TURSO_AUTH_TOKEN || '';
const USE_TURSO = Boolean(TURSO_URL && TURSO_TOKEN);
const GOOGLE_KEY = process.env.GOOGLE_MAPS_API_KEY || '';
const GOOGLE_PLACES_KEY = process.env.GOOGLE_PLACES_API_KEY || '';
const TAIWAN_PLACES = require('./locations/taiwan.json');
const {parseQuickText,orderedInsert,validKind,validPriority} = require('./lib/quick-add');
const GEMINI_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.6-flash';
const clients = new Map();
const searchCache = new Map();
const previewRate = new Map();
let writes = Promise.resolve();
let initialized;

function problem(status, message) { const e = new Error(message); e.status = status; return e; }
function clean(s, limit = 240) { return String(s ?? '').trim().slice(0, limit); }
function validDate(d) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
  const date = new Date(`${d}T12:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === d;
}
function point(p) { return Number.isFinite(Number(p)) ? Number(p) : NaN; }
function safePlace(body, dayCount, current = {}) {
  const p = {...current};
  const data = body && typeof body === 'object' ? body : {};
  if ('name' in data) p.name = clean(data.name, 130);
  if ('address' in data) p.address = clean(data.address, 250);
  if ('note' in data) p.note = clean(data.note, 1500);
  if ('category' in data) p.category = ['spot','food','cafe','hotel','shopping','transport'].includes(data.category) ? data.category : 'spot';
  if ('time' in data) p.time = /^([01]\d|2[0-3]):[0-5]\d$/.test(data.time) ? data.time : '';
  if ('day' in data) p.day = Math.trunc(Number(data.day));
  if ('lat' in data) p.lat = point(data.lat);
  if ('lng' in data) p.lng = point(data.lng);
  if ('duration' in data) p.duration = Math.min(1440, Math.max(0, Math.trunc(Number(data.duration) || 0)));
  if ('googlePlaceId' in data) p.googlePlaceId = clean(data.googlePlaceId, 200);
  if ('kind' in data) p.kind = validKind(data.kind);
  if (!p.kind) p.kind = 'plan';
  if (!p.name) throw problem(400, '장소 이름을 입력해주세요.');
  if (!Number.isInteger(p.day) || p.day < 0 || p.day >= dayCount) throw problem(400, '여행 날짜가 올바르지 않습니다.');
  if (!Number.isFinite(p.lat) || p.lat < -90 || p.lat > 90 || !Number.isFinite(p.lng) || p.lng < -180 || p.lng > 180) throw problem(400, '지도 좌표가 올바르지 않습니다.');
  return p;
}
function newTrip(body) {
  const b = body && typeof body === 'object' ? body : {};
  const title = clean(b.title, 100);
  const startDate = clean(b.startDate, 10);
  const dayCount = Math.trunc(Number(b.dayCount));
  if (!title) throw problem(400, '여행 제목을 입력해주세요.');
  if (!validDate(startDate)) throw problem(400, '시작 날짜를 확인해주세요.');
  if (!Number.isInteger(dayCount) || dayCount < 1 || dayCount > 30) throw problem(400, '여행 기간은 1일~30일 사이로 입력해주세요.');
  const now = new Date().toISOString();
  return {id: crypto.randomBytes(16).toString('hex'), version: 1, title, destination: clean(b.destination, 120), startDate, dayCount, description: clean(b.description, 800), places: [], createdAt: now, updatedAt: now};
}
function sqlArg(value) { return value === null || value === undefined ? {type: 'null'} : {type: 'text', value: String(value)}; }
async function sql(sqlText, args = []) {
  const url = TURSO_URL.replace(/^libsql:\/\//i, 'https://').replace(/\/$/, '');
  const r = await fetch(url + '/v2/pipeline', {
    method:'POST', headers:{'Content-Type':'application/json', 'Authorization': 'Bearer ' + TURSO_TOKEN},
    body:JSON.stringify({requests:[{type:'execute',stmt:{sql:sqlText,args:args.map(sqlArg)}},{type:'close'}]}), signal:AbortSignal.timeout(15000)
  });
  if (!r.ok) throw new Error('Turso HTTP 오류: ' + r.status);
  const data = await r.json();
  const one = data.results && data.results[0];
  if (!one || one.type !== 'ok') throw new Error('Turso 쿼리 오류: ' + (one?.error?.message || '알 수 없음'));
  return one.response.result;
}
async function init() {
  if (USE_TURSO) {
    await sql('CREATE TABLE IF NOT EXISTS moatrip_trips (id TEXT PRIMARY KEY, payload TEXT NOT NULL, updated_at TEXT NOT NULL)');
  } else {
    await fs.mkdir(DATA_DIR,{recursive:true});
  }
}
function ensureReady() { if (!initialized) initialized = init().catch(e => { initialized = null; throw e; }); return initialized; }
async function getTrip(id) {
  if (!/^[a-f0-9]{32}$/.test(id)) return null;
  await ensureReady();
  try {
    if (USE_TURSO) {
      const r = await sql('SELECT payload FROM moatrip_trips WHERE id = ? LIMIT 1',[id]);
      const row = r.rows?.[0];
      return row ? JSON.parse(row[0].value) : null;
    }
    const data = await fs.readFile(path.join(DATA_DIR,id+'.json'),'utf8');
    return JSON.parse(data);
  } catch(e) {
    if (e.code === 'ENOENT') return null;
    throw e;
  }
}
async function saveTrip(trip) {
  await ensureReady();
  if (USE_TURSO) {
    await sql('INSERT INTO moatrip_trips (id, payload, updated_at) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at', [trip.id, JSON.stringify(trip), trip.updatedAt]);
  } else {
    const filename = path.join(DATA_DIR, trip.id+'.json');
    const temp = filename + '.' + crypto.randomBytes(5).toString('hex') + '.tmp';
    await fs.writeFile(temp, JSON.stringify(trip,null,2),'utf8');
    await fs.rename(temp,filename);
  }
}
function broadcast(trip) {
  const message = `event: trip\ndata: ${JSON.stringify(trip)}\n\n`;
  for (const client of clients.get(trip.id) || []) { try { client.write(message); } catch {} }
}
async function mutation(id, change) {
  const operation = writes.then(async () => {
    const trip = await getTrip(id);
    if (!trip) throw problem(404, '여행을 찾을 수 없습니다.');
    const result = await change(trip);
    trip.version += 1;
    trip.updatedAt = new Date().toISOString();
    await saveTrip(trip);
    broadcast(trip);
    return {trip, result};
  });
  writes = operation.catch(() => {});
  return operation;
}
function sendJSON(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {'Content-Type':'application/json; charset=utf-8','Content-Length':Buffer.byteLength(body), 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff'});
  res.end(body);
}
async function readBody(req, maxBytes=1048576) {
  let bytes = 0;
  const chunks = [];
  for await (const chunk of req) {
    bytes += chunk.length;
    if (bytes > maxBytes) throw problem(413, '요청 크기가 너무 큽니다.');
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw problem(400, '잘못된 요청 형식입니다.'); }
}
function normalizeSearch(s) { return String(s ?? '').normalize('NFKC').toLocaleLowerCase().replace(/[\s\-_.(),·]/g, ''); }
function taiwanSearch(q) {
  const needle = normalizeSearch(q);
  if (!needle) return [];
  return TAIWAN_PLACES.filter(p => [p.name, ...p.aliases].some(alias => {
    const name = normalizeSearch(alias);
    return name.includes(needle) || (needle.length >= 3 && needle.includes(name));
  })).slice(0, 8).map(({name,address,lat,lng,category}) => ({name,address,lat,lng,category,source:'대만 인기 장소'}));
}
async function photonSearch(q, lat, lon) {
  const url = new URL('https://photon.komoot.io/api/');
  url.searchParams.set('q', q);
  url.searchParams.set('limit', '8');
  // Korean translations may be unavailable. Photon falls back to the local-language name.
  url.searchParams.set('lang', 'en');
  if (lat !== null && lon !== null && Number.isFinite(Number(lat)) && Number.isFinite(Number(lon)) && Math.abs(Number(lat)) <= 90 && Math.abs(Number(lon)) <= 180) {
    url.searchParams.set('lat', String(lat)); url.searchParams.set('lon', String(lon));
  }
  const r = await fetch(url, {headers:{'Accept':'application/json','User-Agent':'MoaTrip/1.1 (travel planning)'}, signal:AbortSignal.timeout(7000)});
  if (!r.ok) throw new Error('Photon HTTP ' + r.status);
  const data = await r.json();
  return (data.features || []).slice(0,8).map(f => {
    const p = f.properties || {};
    const pieces = [p.street && (p.street+(p.housenumber ? ' '+p.housenumber : '')),p.district,p.city,p.state,p.country].filter(Boolean);
    return {name: clean(p.name || p.city || p.street || p.country,130), address:clean(pieces.join(', ') || p.name || '',250), lat:Number(f.geometry?.coordinates?.[1]),lng:Number(f.geometry?.coordinates?.[0]),type:clean(p.osm_value,50),source:'OpenStreetMap'};
  }).filter(p=>p.name&&Number.isFinite(p.lat)&&Number.isFinite(p.lng));
}
async function googlePlaceSearch(q, lat, lon) {
  if (!GOOGLE_PLACES_KEY) return [];
  const center = {latitude:Number.isFinite(Number(lat)) ? Number(lat) : 25.0479,longitude:Number.isFinite(Number(lon)) ? Number(lon) : 121.5171};
  const r = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method:'POST',
    headers:{'Content-Type':'application/json','X-Goog-Api-Key':GOOGLE_PLACES_KEY,'X-Goog-FieldMask':'places.id,places.displayName,places.formattedAddress,places.location,places.primaryType'},
    body:JSON.stringify({textQuery:q,languageCode:'ko',regionCode:'TW',locationBias:{circle:{center,radius:50000}}}),
    signal:AbortSignal.timeout(7000)
  });
  if (!r.ok) throw new Error('Google Places HTTP '+r.status);
  const data = await r.json();
  return (data.places || []).slice(0,8).map(p=>({name:clean(p.displayName?.text,130),address:clean(p.formattedAddress,250),lat:Number(p.location?.latitude),lng:Number(p.location?.longitude),googlePlaceId:clean(p.id,200),source:'Google Places'})).filter(p=>p.name&&Number.isFinite(p.lat)&&Number.isFinite(p.lng));
}
async function searchPlaces(q, lat, lon) {
  const key = [q, lat ?? '', lon ?? ''].join('|').toLowerCase();
  const cached = searchCache.get(key);
  if (cached && Date.now()-cached.t < 1000*60*15) return cached;
  const local = taiwanSearch(q);
  // The hand-curated Taiwan place index is instantaneous and works if third-party search is down.
  if (local.length) {
    const output={t:Date.now(),results:local,source:'대만 인기 장소'};
    searchCache.set(key,output);
    if(searchCache.size>250)searchCache.delete(searchCache.keys().next().value);
    return output;
  }
  let remote = [], remoteSource = '', failures = [];
  if (GOOGLE_PLACES_KEY) {
    try {remote = await googlePlaceSearch(q,lat,lon);remoteSource='Google Places';}
    catch(e){console.warn('[검색] Google Places:',e.message);failures.push(e);}
  }
  if (!remote.length) {
    try {remote = await photonSearch(q,lat,lon);remoteSource='OpenStreetMap / Photon';}
    catch(e){console.warn('[검색] Photon:',e.message);failures.push(e);}
  }
  if (!local.length && !remote.length && failures.length && (!GOOGLE_PLACES_KEY || failures.length >= 2)) {
    throw problem(502,'장소 검색 서버가 잠시 응답하지 않습니다. 지도에서 위치를 직접 선택할 수 있습니다.');
  }
  const results = [...local];
  // Deduplicate by location to avoid listing a local suggestion and the same remote place twice.
  for (const p of remote) {
    if (!results.some(prev=>Math.abs(prev.lat-p.lat)<0.0008&&Math.abs(prev.lng-p.lng)<0.0008)) results.push(p);
    if(results.length>=10)break;
  }
  const output={t:Date.now(),results:results.slice(0,10),source:remoteSource||'대만 인기 장소'};
  searchCache.set(key,output);
  if(searchCache.size>250)searchCache.delete(searchCache.keys().next().value);
  return output;
}


function takeImage(dataUrl){
  if(!dataUrl)return null;
  if(typeof dataUrl!=='string')throw problem(400,'사진 형식이 올바르지 않습니다.');
  const m=dataUrl.match(/^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/);
  if(!m||m[2].length>4400000||m[2].length<80)throw problem(400,'JPG, PNG, WebP 사진(최대 3MB)을 선택해주세요.');
  return {mimeType:'image/'+m[1],data:m[2]};
}
function normalizeAiResult(data){
  const category=['spot','food','cafe','hotel','shopping','transport'].includes(data?.category)?data.category:'spot';
  return {name:clean(data?.placeName||data?.name,130),alias:clean(data?.localName||data?.alias,130),category,
    details:clean(data?.details,350),nearby:clean(data?.nearby,350)};
}
async function extractPhotoWithGemini(image,note){
  if(!GEMINI_KEY)throw problem(422,'사진 자동 인식은 아직 설정되지 않았습니다. Render의 GEMINI_API_KEY를 연결해주세요. 사진 없이 장소 이름을 입력해 추가할 수 있습니다.');
  const prompt=`You are reading a screenshot of a Taiwanese travel blog/map/restaurant recommendation. Extract ONLY the main specific place/business visible, not the blog author, date or headings. Preserve exact traditional Chinese and English business name if visible. User note takes precedence for schedule instructions. Never invent location/address/coordinates. If no identifiable place, placeName must be empty. Classify main place into spot,food,cafe,hotel,shopping,transport. Return concise JSON keys: placeName, localName, category, details, nearby. Nearby other shop mentioned in note should be a note, NOT a second place. User note: ${note.slice(0,1200)}`;
  const response=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(GEMINI_MODEL)}:generateContent`,{
    method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':GEMINI_KEY},
    body:JSON.stringify({contents:[{parts:[{text:prompt},{inline_data:{mime_type:image.mimeType,data:image.data}}]}],generationConfig:{responseMimeType:'application/json',temperature:0.1}}),signal:AbortSignal.timeout(24000)
  });
  if(!response.ok){const err=await response.text().catch(()=> '');console.warn('Gemini error:',response.status,err.slice(0,120));throw problem(502,'사진 분석 서비스에 연결할 수 없습니다. API 키와 모델 설정을 확인해주세요.');}
  const json=await response.json();const output=json.candidates?.[0]?.content?.parts?.map(p=>p.text||'').join('')||'';
  try {return normalizeAiResult(JSON.parse(output.replace(/^```(?:json)?\s*|\s*```$/g,'')));}
  catch {throw problem(502,'사진에서 장소 이름을 인식하지 못했습니다. 장소 이름을 직접 입력해주세요.');}
}
function guardQuickRate(req, tripId){
  const addr=String(req.socket.remoteAddress||'unknown');
  const key=tripId+':'+addr;
  const now=Date.now(),old=previewRate.get(key)||[];
  const active=old.filter(ts=>now-ts<15*60*1000);
  if(active.length>=25)throw problem(429,'사진·장소 검색은 15분에 최대 25회까지 가능합니다. 잠시 후 다시 시도해주세요.');
  active.push(now);previewRate.set(key,active);
  if(previewRate.size>1500){for(const [k,v] of previewRate){if(now-v.at(-1)>15*60*1000)previewRate.delete(k);}}
}
async function quickPreview(body,trip){
  const note=clean(body?.note,1800);
  const image=takeImage(body?.image);
  const typedName=clean(body?.name,130);
  if(!image&&!typedName&&!note)throw problem(400,'사진이나 장소 이름, 메모를 입력해주세요.');
  const first=parseQuickText(note,trip,Number(body?.activeDay));
  const ai=image&&!typedName?await extractPhotoWithGemini(image,note):null;
  const name=typedName||ai?.name||'';
  const categoryOverride=['spot','food','cafe','hotel','shopping','transport'].includes(body?.category)?body.category:null;
  const kindOverride=['plan','candidate'].includes(body?.kind)?body.kind:null;
  const category=categoryOverride||((ai?.category&&ai.category!=='spot')?ai.category:first.category);
  const kind=kindOverride||first.kind;
  const day=Number.isInteger(Number(body?.day))&&Number(body.day)>=0&&Number(body.day)<trip.dayCount?Number(body.day):first.day;
  const time=/^([01]\d|2[0-3]):[0-5]\d$/.test(body?.time||'')?body.time:first.time;
  const priority=['first','last'].includes(body?.priority)?body.priority:first.priority;
  const combined=[note,ai?.nearby&&!note.includes(ai.nearby)?'근처 참고: '+ai.nearby:'',ai?.details&&!note.includes(ai.details)?'사진 정보: '+ai.details:''].filter(Boolean).join('\n').slice(0,1500);
  let matches=[],lookupError='';
  if(name.length>=2){
    for(const query of [name,ai?.alias].filter(Boolean)){
      try{const r=await searchPlaces(query,25.0479,121.5171);matches=r.results.filter(p=>p.lat>=21&&p.lat<=26.6&&p.lng>=119&&p.lng<=123).slice(0,7);if(matches.length)break;}
      catch(e){lookupError=e.message;}
    }
  }
  // Never silently persist an ambiguous search hit. The UI always offers review before save.
  return {draft:{name,category,kind,day,time,priority,note:combined},matches,photoAiEnabled:!!GEMINI_KEY,lookupError};
}

const MIME = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon','.webmanifest':'application/manifest+json; charset=utf-8'};
async function serveStatic(res, pathname) {
  let decoded;
  try {decoded = decodeURIComponent(pathname);} catch {throw problem(400,'잘못된 주소입니다.');}
  const requested = decoded === '/' ? '/index.html' : decoded;
  const name = path.resolve(PUBLIC,'.'+requested);
  if (!name.startsWith(PUBLIC+path.sep)) throw problem(403,'허용되지 않는 경로입니다.');
  try {
    const file = await fs.readFile(name);
    res.writeHead(200,{'Content-Type':MIME[path.extname(name)] || 'application/octet-stream','Content-Length':file.length,'Cache-Control':'no-cache', 'X-Content-Type-Options':'nosniff'});
    res.end(file);
  } catch(e) { if(e.code==='ENOENT'||e.code==='EISDIR') throw problem(404,'파일을 찾을 수 없습니다.'); throw e; }
}
function createServer() {
  return http.createServer(async(req,res) => {
    try {
      const url = new URL(req.url,'http://localhost');
      const pathname = url.pathname;
      if (pathname === '/api/health' && req.method === 'GET') return sendJSON(res,200,{ok:true, storage:USE_TURSO?'turso':'local',googleMapsEnabled:!!GOOGLE_KEY,googlePlacesEnabled:!!GOOGLE_PLACES_KEY,photoAiEnabled:!!GEMINI_KEY});
      if (pathname === '/api/config' && req.method === 'GET') return sendJSON(res,200,{googleMapsKey:GOOGLE_KEY,googlePlacesEnabled:!!GOOGLE_PLACES_KEY,photoAiEnabled:!!GEMINI_KEY,storage:USE_TURSO?'turso':'local'});
      if (pathname === '/api/search' && req.method === 'GET') {
        const q = clean(url.searchParams.get('q'),150);
        if(q.length<2) return sendJSON(res,200,{results:[]});
        const result=await searchPlaces(q,url.searchParams.get('lat'),url.searchParams.get('lon'));
        return sendJSON(res,200,{results:result.results,source:result.source});
      }
      if (pathname === '/api/trips' && req.method === 'POST') {
        const trip = newTrip(await readBody(req));
        await saveTrip(trip);
        return sendJSON(res,201,{trip});
      }
      if (pathname === '/api/trips/import' && req.method === 'POST') {
        const body=await readBody(req);
        const input = body?.trip || body;
        const t = newTrip(input);
        if (!Array.isArray(input?.places)||input.places.length>250) throw problem(400,'가져올 장소 데이터가 올바르지 않습니다.');
        t.places=input.places.map(p=>({...safePlace(p,t.dayCount),id:crypto.randomUUID(),createdAt:new Date().toISOString()}));
        await saveTrip(t);return sendJSON(res,201,{trip:t});
      }
      const m = pathname.match(/^\/api\/trips\/([a-f0-9]{32})(?:\/(.*))?$/);
      if (m) {
        const [_,id,rest=''] = m;
        if(!rest && req.method === 'GET') {
          const trip = await getTrip(id);
          if(!trip) throw problem(404,'여행을 찾을 수 없습니다.');
          return sendJSON(res,200,{trip});
        }
        if(rest==='quick-preview' && req.method==='POST') {
          const trip=await getTrip(id);if(!trip)throw problem(404,'여행을 찾을 수 없습니다.');
          guardQuickRate(req,id);
          const body=await readBody(req,5200000);
          const preview=await quickPreview(body,trip);
          return sendJSON(res,200,preview);
        }
        if(rest==='events' && req.method==='GET') {
          if (!(await getTrip(id))) throw problem(404,'여행을 찾을 수 없습니다.');
          res.writeHead(200,{'Content-Type':'text/event-stream; charset=utf-8','Cache-Control':'no-cache, no-transform','Connection':'keep-alive','X-Accel-Buffering':'no'});
          res.write(': connected\n\n');
          if (!clients.has(id))clients.set(id,new Set());
          clients.get(id).add(res);
          const timer = setInterval(()=>{try{res.write(': heartbeat\n\n');}catch{}},25000);
          req.on('close',()=>{clearInterval(timer);clients.get(id)?.delete(res);if(!clients.get(id)?.size)clients.delete(id);});
          return;
        }
        if(!rest && req.method==='PATCH') {
          const body=await readBody(req);
          const {trip}=await mutation(id,t=>{
            if('title' in body){ const v=clean(body.title,100);if(!v)throw problem(400,'여행 제목을 입력해주세요.');t.title=v; }
            if('destination' in body)t.destination=clean(body.destination,120);
            if('startDate' in body){ const v=clean(body.startDate,10);if(!validDate(v))throw problem(400,'날짜를 확인해주세요.');t.startDate=v; }
            if('description' in body)t.description=clean(body.description,800);
            if('dayCount' in body){const v=Math.trunc(Number(body.dayCount));if(v<1||v>30||!Number.isInteger(v))throw problem(400,'1~30일만 지원합니다.');if(t.places.some(p=>p.day>=v))throw problem(400,'줄이려는 날짜에 일정이 남아 있습니다. 먼저 옮기거나 삭제해주세요.');t.dayCount=v;}
          });
          return sendJSON(res,200,{trip});
        }
        if(rest==='places'&&req.method==='POST') {
          const body=await readBody(req);
          const {trip,result}=await mutation(id,t=>{
            if(t.places.length>=250)throw problem(400,'장소는 여행당 최대 250개입니다.');
            const place={...safePlace(body,t.dayCount),id:crypto.randomUUID(),createdAt:new Date().toISOString()};
            if (body.smartOrder === true) orderedInsert(t.places,place,validPriority(body.priority));
            else t.places.push(place);
            return place;
          });return sendJSON(res,201,{trip,place:result});
        }
        const pm=rest.match(/^places\/([0-9a-f-]{36})$/);
        if(pm&&req.method==='PATCH') {
          const body=await readBody(req);
          const {trip}=await mutation(id,t=>{
            const idx=t.places.findIndex(p=>p.id===pm[1]);if(idx<0)throw problem(404,'장소를 찾을 수 없습니다.');
            t.places[idx]=safePlace(body,t.dayCount,t.places[idx]);
          });return sendJSON(res,200,{trip});
        }
        if(pm&&req.method==='DELETE') {
          const {trip}=await mutation(id,t=>{
            const idx=t.places.findIndex(p=>p.id===pm[1]);if(idx<0)throw problem(404,'장소를 찾을 수 없습니다.');t.places.splice(idx,1);
          });return sendJSON(res,200,{trip});
        }
        if(rest==='reorder'&&req.method==='POST') {
          const body=await readBody(req);
          const {trip}=await mutation(id,t=>{
            const d=Math.trunc(Number(body.day));if(d<0||d>=t.dayCount)throw problem(400,'날짜가 올바르지 않습니다.');
            const existing=t.places.filter(p=>p.day===d);
            const ids=body.ids;
            if(!Array.isArray(ids)||ids.length!==existing.length||new Set(ids).size!==ids.length||!existing.every(p=>ids.includes(p.id)))throw problem(409,'다른 사용자가 일정을 변경했습니다. 새로고침 후 다시 시도해주세요.');
            const map=new Map(existing.map(p=>[p.id,p]));
            const replacement=ids.map(id=>map.get(id));
            let i=0;
            t.places=t.places.map(p=>p.day===d?replacement[i++]:p);
          });return sendJSON(res,200,{trip});
        }
        throw problem(404,'요청한 기능을 찾을 수 없습니다.');
      }
      if(pathname.startsWith('/api/'))throw problem(404,'요청한 기능을 찾을 수 없습니다.');
      if(req.method!=='GET'&&req.method!=='HEAD')throw problem(405,'지원하지 않는 요청입니다.');
      return serveStatic(res,pathname);
    }catch(e) {
      if(!res.headersSent)sendJSON(res,e.status||500,{error:e.status?e.message:'서버 처리 중 오류가 발생했습니다.'});
      if(!e.status)console.error('[MoaTrip]',e.message);
    }
  });
}
if(require.main===module){
  const port=Number(process.env.PORT)||3000;
  ensureReady().then(()=>createServer().listen(port,'0.0.0.0',()=>console.log(`MoaTrip: http://localhost:${port} (${USE_TURSO?'Turso':'local JSON'})`))).catch(e=>{console.error('저장소 초기화 실패:',e);process.exit(1);});
}
module.exports={createServer,newTrip,safePlace,getTrip,ensureReady};
