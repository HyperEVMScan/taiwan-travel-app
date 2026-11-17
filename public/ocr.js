'use strict';
// Client-side screenshot text recognition. No API key or photo upload to the app server.
(function(root,factory){
  const api=factory(root);
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  root.MoaOCR=api;
})(typeof window!=='undefined'?window:globalThis,function(root){
  const CDN='https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
  let loading=null;
  const STOP=/^(?:youtube|naver|google|chrome|블로그|로그인|검색|메뉴|지도|댓글|공유|저장|좋아요|예약|주문|여행|여행정보|후기|정보|사진|위치|더보기|자세히|영업|영업시간|주소|전화|오시는길|맛집|카페|추천|대만|타이베이|taiwan|taipei|new taipei|menu|hours|open|close|home|search|review|reviews)$/i;
  const NOISE=/(?:https?:\/\/|www\.|\.com\b|\.kr\b|구독|좋아요|팔로우|게시일|글쓴이|조회수|댓글|캡처|스크린샷|오늘|내일|몇시|수요일|화요일|목요일|금요일|토요일|일요일|오전\s*\d|오후\s*\d|\d{2,4}[.\/-]\d{1,2}[.\/-]\d{1,2}|202[0-9])|^\s*\d{1,2}:\d{2}\s*$/i;
  function cleanText(value){return String(value||'').replace(/\r/g,'').replace(/[\u200b-\u200f\ufeff]/g,'').replace(/ {3,}/g,'  ').trim().slice(0,4500);}
  function extractCandidates(text){
    const lines=cleanText(text).split('\n').map(line=>line.replace(/[\t ]+/g,' ').replace(/^[\s\-·•:|]+|[\s\-·•:|]+$/g,'').trim()).filter(Boolean);
    const scored=[];
    for(let i=0;i<lines.length;i++){
      const line=lines[i];
      if(line.length<3||line.length>105||STOP.test(line)||NOISE.test(line)||/^[\d\p{P}\p{S}\s]+$/u.test(line))continue;
      // Avoid generic Korean article headlines. Name-like English/Chinese strings
      // and short standalone signs get higher priority, not certainty.
      const hasLatin=/[A-Za-z]{2,}/.test(line),han=(line.match(/[\u3400-\u9fff]/g)||[]).length;
      const korean=(line.match(/[가-힣]/g)||[]).length;
      const latinWords=(line.match(/[A-Za-z]+/g)||[]).length;
      let score=0;
      if(hasLatin)score+=3;
      if(han>=2)score+=5;
      if(hasLatin&&han>=2)score+=6;
      if(hasLatin&&/\b(?:of|the|cafe|coffee|rice|restaurant|hotel|market|tea|mall|shop)\b/i.test(line))score+=3;
      if(korean>0&&!han&&!hasLatin&&line.length>25)score-=6;
      if(korean>0&&!han&&!hasLatin&&line.length<=25)score+=3;
      if(/\b(?:역|주변|근처|거리|여행|맛집|방문|총정리|소개|내돈내산)\b/.test(line))score-=2;
      if(/(?:점|집|카페|호텔|빌딩|시장|백화점|박물관|야시장)$/.test(line)&&line.length<32)score+=3;
      if(line.length<=34)score+=3;
      if(line.length>70)score-=5;
      score+=Math.max(0,4-i)*0.5;
      scored.push({value:line.slice(0,100),score,index:i});
      // Split a mixed headline to suggest the bilingual actual venue name.
      const mixed=line.match(/([A-Z][A-Za-z0-9'&.\- ]{7,60}?[A-Za-z]\s+[\u3400-\u9fff]{2,12})/);
      if(mixed)scored.push({value:mixed[1].trim(),score:score+9,index:i});
      const chinese=line.match(/[\u3400-\u9fff]{2,12}(?:[（(][\u3400-\u9fffA-Za-z ]{2,15}[)）])?/g)||[];
      if(hasLatin&&chinese.length)for(const s of chinese)scored.push({value:s,score:score+1,index:i});
    }
    const output=[];const seen=new Set();
    scored.sort((a,b)=>b.score-a.score||a.index-b.index);
    for(const x of scored){const v=x.value.trim();const key=v.toLowerCase().replace(/\s/g,'');if(seen.has(key)||STOP.test(v))continue;seen.add(key);output.push(v);if(output.length>=6)break;}
    return output;
  }
  function guessCategory(text){const s=cleanText(text);if(/(?:식당|맛집|주먹밥|飯糰|飯糰霸|판투안|점심|밥집|早餐|餐廳|restaurant|rice ball|훠궈|牛肉麵)/i.test(s))return 'food';
    if(/(?:카페|커피|디저트|밀크티|버블티|빙수|茶飲|甜點|coffee|dessert|bubble tea|cafe)/i.test(s))return 'cafe';
    if(/(?:마트|쇼핑|상점|소품샵|완렌빌딩|百貨|商店|shopping|market|mall|shop)/i.test(s))return 'shopping';
    if(/(?:호텔|숙소|旅館|飯店|hotel|hostel)/i.test(s))return 'hotel';
    return 'spot';}
  async function ensureEngine(){
    if(root.Tesseract?.createWorker)return root.Tesseract;
    if(!root.document)throw Error('웹 브라우저에서만 사진 글자를 추출할 수 있어요.');
    if(!loading)loading=new Promise((resolve,reject)=>{
      const tag=root.document.createElement('script');tag.src=CDN;tag.async=true;
      tag.onload=()=>root.Tesseract?.createWorker?resolve(root.Tesseract):reject(Error('OCR 라이브러리를 불러오지 못했어요.'));
      tag.onerror=()=>reject(Error('OCR 파일을 내려받지 못했어요. 인터넷 연결을 확인해주세요.'));
      root.document.head.appendChild(tag);
    }).catch(e=>{loading=null;throw e;});
    return loading;
  }
  async function recognize(file,progress){
    if(!file||!/^image\//.test(file.type))throw Error('PNG 또는 JPG 스크린샷을 선택해주세요.');
    if(file.size>12*1024*1024)throw Error('12MB 이하의 사진을 선택해주세요.');
    const engine=await ensureEngine();
    let worker;
    try{
      // Taiwanese Traditional Chinese + English + Korean screenshot text.
      // Language files are downloaded once and then cached by the browser.
      worker=await engine.createWorker(['kor','eng','chi_tra'],1,{
        logger:m=>{if(typeof progress==='function')progress(m);}
      });
      const result=await worker.recognize(file);
      const text=cleanText(result?.data?.text||'');
      if(!text)throw Error('글자를 찾지 못했어요. 글씨가 선명하게 보이도록 다시 캡처해주세요.');
      return {text,candidates:extractCandidates(text),category:guessCategory(text)};
    }finally{if(worker)await worker.terminate().catch(()=>{});}
  }
  return {recognize,extractCandidates,guessCategory,cleanText};
});
