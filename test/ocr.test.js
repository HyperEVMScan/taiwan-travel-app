'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {extractCandidates,guessCategory,cleanText}=require('../public/ocr');
test('대만 블로그 스크린샷에서 영문+번체 상호명을 우선 제안',()=>{
  const text='대만 타이베이메인역 아침 맛집 Master of Rice Ball 飯糰霸 대만식 주먹밥 판투안\n아삼\n2026.8.5 11:18\nMaster of Rice Ball';
  const names=extractCandidates(text);
  assert.equal(names[0],'Master of Rice Ball 飯糰霸');
  assert.ok(names.includes('飯糰霸'));
  assert.ok(!names.some(x=>x.includes('2026.8.5')));
  assert.equal(guessCategory(text),'food');
});
test('쇼핑 빌딩 및 카페 후보 분류',()=>{
  const a=extractCandidates('완렌빌딩\nWannian Commercial Building\n쇼핑\n15:00');
  assert.ok(a.includes('완렌빌딩'));
  assert.ok(a.includes('Wannian Commercial Building'));
  assert.equal(guessCategory('완렌빌딩 쇼핑 오후 3시'),'shopping');
  assert.equal(guessCategory('버블티 카페 디저트'),'cafe');
  assert.equal(guessCategory('타이베이 101'),'spot');
});
test('OCR 추출 결과에서 화면 노이즈·줄바꿈 정리, 글자 범위 제한',()=>{
  assert.equal(cleanText('\u200b  abc\r\n飯糰霸  '),'abc\n飯糰霸');
  assert.deepEqual(extractCandidates('2026.8.5 11:18\n17:30\n www.example.com \n 로그인'),[]);
  assert.equal(cleanText('가'.repeat(10000)).length,4500);
});
test('브라우저가 OCR 로직을 새 모달보다 먼저 로드하고 API 키 없이 실행',()=>{
  const dir=path.join(__dirname,'..','public');
  const html=fs.readFileSync(path.join(dir,'index.html'),'utf8');
  const app=fs.readFileSync(path.join(dir,'app.js'),'utf8');
  assert.match(html,/\/ocr\.js\?v=1\.4\.0/);
  assert.ok(html.indexOf('/ocr.js?v=1.4.0')<html.indexOf('/app.js?v=1.4.0'));
  assert.match(app,/MoaOCR\.recognize/);
  assert.match(app,/quickOcrText/);
  assert.match(app,/사진 글자 추출/);
  assert.match(app,/const data=await api\('\/api\/trips\/'.*?quick-preview'/);
  assert.match(app,/name,note,category:inferredCategory/);
  assert.doesNotMatch(app,/Render 환경변수 GEMINI_API_KEY 설정 후 사용할 수 있습니다/);
});
