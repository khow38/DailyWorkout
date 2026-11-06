import { build } from 'esbuild';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// Independent artifact builder. Never reads or rewrites the workout index.html.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const threeRoot = path.resolve(path.dirname(require.resolve('three')), '..');
const args = process.argv.slice(2);
let output = path.join(root, 'face-study.html');
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--output' && args[i + 1] && !args[i + 1].startsWith('--')) output = path.resolve(args[++i]);
  else if (args[i].startsWith('--output=') && args[i].length > 9) output = path.resolve(args[i].slice(9));
  else throw new Error('Usage: node scripts/build-face-study.mjs [--output path.html]');
}
if (path.extname(output).toLowerCase() !== '.html') throw new Error('--output must be an .html file');
if (output.toLowerCase() === path.join(root, 'index.html').toLowerCase()) throw new Error('The face study cannot overwrite the workout index.html');

let glb;
try { glb = await readFile(path.join(root, 'assets/face-study.glb')); }
catch (error) {
  if (error.code === 'ENOENT') throw new Error('Pending asset: assets/face-study.glb must exist before building the face study. No placeholder model is generated.');
  throw error;
}
validateEmbeddedGLB(glb);
const license = await readFile(path.join(threeRoot, 'LICENSE'), 'utf8');
const result = await build({
  entryPoints: [path.join(root, 'src/face-study-viewer.js')],
  bundle: true, write: false, format: 'iife', minify: true,
  target: ['chrome100', 'safari16'], legalComments: 'inline',
  define: { __FACE_STUDY_BASE64__: JSON.stringify(glb.toString('base64')) },
});
const inline = result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const safeLicense = license.replaceAll('--', '—');
const html = `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; connect-src data: blob:; worker-src blob:; font-src 'none'; base-uri 'none'; form-action 'none'">
  <meta name="description" content="여성 얼굴·목·어깨의 형태와 빛을 살펴보는 독립형 오프라인 3D 조형 시안.">
  <title>여성 얼굴 · 01 — FORM ATELIER</title>
  <style>${styles()}</style>
</head>
<body data-ready="false" data-status="loading">
  <a class="skip-link" href="#study-settings">조작 패널로 이동</a>
  <div class="app-shell">
    <header class="topbar">
      <a class="wordmark" href="#main" aria-label="폼 아틀리에 스터디"><span class="brand-mark" aria-hidden="true">f.</span>FORM <span class="wordmark-light">ATELIER</span></a>
      <span class="topbar-sub">CHARACTER STUDIES <span aria-hidden="true">/</span> VOL. 01</span>
      <span class="offline"><span aria-hidden="true"></span>오프라인 스튜디오</span>
    </header>
    <main id="main">
      <div class="intro">
        <div><p class="eyebrow">FORM, LIGHT &amp; EXPRESSION</p><h1>여성 얼굴 <span>· 01</span></h1></div>
        <div class="intro-note"><span class="study-tag">3D 조형 시안</span><p>얼굴의 비례와 입체감을 여러 각도에서 살펴보세요.</p></div>
      </div>
      <div class="workspace">
        <section class="stage" id="study-stage" data-light="neutral" aria-label="여성 얼굴 3D 스튜디오" aria-busy="true">
          <div class="stage-top" aria-hidden="true"><span><i></i> LIVE STUDY</span><span id="stage-framing">PORTRAIT</span></div>
          <div class="stage-guide" aria-hidden="true"><span></span><span></span><span></span><span></span></div>
          <canvas id="study-canvas" tabindex="0" role="img" aria-label="회전 가능한 여성 얼굴 3D 조형 시안" aria-describedby="canvas-help">3D 표시에는 WebGL 2를 지원하는 브라우저가 필요합니다.</canvas>
          <div class="notice" id="viewer-notice" role="status" aria-live="polite" aria-atomic="true">
            <span class="notice-symbol" aria-hidden="true">◌</span>
            <p id="notice-text">빛과 형태를 준비하고 있습니다…</p>
            <button id="retry" type="button" hidden>다시 열기</button>
            <button id="dismiss-notice" type="button" hidden>확인</button>
          </div>
          <div class="stage-bottom"><div><span class="stage-index">01 <span>/ FACE STUDY</span></span><span id="stage-light">뉴트럴 스튜디오</span></div>
            <div class="stage-actions" aria-label="확대 및 시점 초기화">
              <button id="zoom-out" type="button" data-stage-action disabled aria-label="축소">−</button>
              <button id="zoom-in" type="button" data-stage-action disabled aria-label="확대">+</button>
              <button id="reset-view" type="button" data-stage-action disabled aria-label="정면으로 초기화">↺</button>
            </div>
          </div>
        </section>
        <aside class="inspector" aria-label="스터디 조작 패널">
          <div class="panel-heading"><h2>스튜디오 설정</h2><span>STUDY TOOLS</span></div>
          <fieldset id="study-settings" disabled>
            <legend class="sr-only">3D 얼굴 조작</legend>
            <section class="control-section">
              <h3><span>01</span>시점</h3>
              <div class="segmented views" role="group" aria-label="시점 선택">
                <button type="button" data-view="front" aria-pressed="true">정면</button>
                <button type="button" data-view="45deg" aria-pressed="false">45°</button>
                <button type="button" data-view="side" aria-pressed="false">측면</button>
                <button type="button" data-view="back" aria-pressed="false">후면</button>
              </div>
              <div class="framing-row"><span>프레이밍</span><div class="framing" role="group" aria-label="프레이밍 선택"><button type="button" data-framing="portrait" aria-pressed="true">얼굴</button><button type="button" data-framing="bust" aria-pressed="false">상반신</button></div></div>
            </section>
            <section class="control-section">
              <h3><span>02</span>빛과 분위기</h3>
              <div class="light-options" role="group" aria-label="스튜디오 조명 선택">
                <button type="button" data-light="neutral" aria-pressed="true"><span class="light-orb neutral" aria-hidden="true"></span>뉴트럴</button>
                <button type="button" data-light="warm" aria-pressed="false"><span class="light-orb warm" aria-hidden="true"></span>웜</button>
                <button type="button" data-light="cool" aria-pressed="false"><span class="light-orb cool" aria-hidden="true"></span>쿨</button>
              </div>
              <div class="slider-row"><label for="exposure">노출</label><output id="exposure-value" for="exposure">1.00×</output><input id="exposure" type="range" min="0.6" max="1.6" step="0.01" value="1.00"></div>
            </section>
            <section class="control-section display-controls">
              <h3><span>03</span>형태 살펴보기</h3>
              <label class="toggle-row" id="hair-control" hidden><span>헤어 표시</span><input type="checkbox" id="hair" role="switch" checked><span class="switch" aria-hidden="true"></span></label>
              <label class="toggle-row"><span>자동 회전</span><input type="checkbox" id="rotate" role="switch"><span class="switch" aria-hidden="true"></span></label>
              <label class="toggle-row"><span>와이어프레임</span><input type="checkbox" id="wireframe" role="switch"><span class="switch" aria-hidden="true"></span></label>
            </section>
            <section class="control-section" id="morph-controls" hidden><h3><span>04</span>표정 스터디</h3><div id="morph-list"></div></section>
          </fieldset>
          <div class="panel-note"><span class="note-mark" aria-hidden="true">✳</span><p>아직 완성 전인 조형 연구입니다.<br>여러 각도와 빛에서 인상을 살펴보세요.</p></div>
        </aside>
      </div>
      <div class="under-stage"><p id="canvas-help"><span aria-hidden="true">↔</span> 드래그로 회전 · 스크롤 / 두 손가락으로 확대<span class="keyboard-help"> · 키보드 방향키로 회전, + / −로 확대, Home으로 정면</span></p><span class="ready-status"><i aria-hidden="true"></i><span id="status-label" role="status">모델 준비 중</span></span></div>
    </main>
    <footer><span>FORM ATELIER <span class="footer-divider">/</span> CHARACTER EXPLORATION</span><span>독립형 얼굴 스터디 · 01</span></footer>
  </div>
  <noscript><div class="noscript">3D 스터디를 보려면 브라우저에서 JavaScript를 허용해 주세요.</div></noscript>
  <!-- Bundled three.js license:\n${safeLicense}\n-->
  <script>${inline}</script>
</body>
</html>`;
await mkdir(path.dirname(output), { recursive: true });
await writeFile(output, html, 'utf8');
console.log(`Built ${output}\nEmbedded GLB ${(glb.byteLength / 1048576).toFixed(2)} MiB; standalone HTML ${(Buffer.byteLength(html) / 1048576).toFixed(2)} MiB`);

function validateEmbeddedGLB(buffer) {
  if (buffer.length < 20 || buffer.readUInt32LE(0) !== 0x46546c67 || buffer.readUInt32LE(4) !== 2 || buffer.readUInt32LE(8) !== buffer.length) throw new Error('assets/face-study.glb is not a complete GLB 2.0 file');
  const jsonLength = buffer.readUInt32LE(12);
  if (buffer.readUInt32LE(16) !== 0x4e4f534a || 20 + jsonLength > buffer.length) throw new Error('Invalid GLB JSON chunk');
  const document = JSON.parse(buffer.subarray(20, 20 + jsonLength).toString('utf8').trim());
  for (const item of [...(document.buffers || []), ...(document.images || [])]) {
    if (item.uri && !/^data:/i.test(item.uri)) throw new Error(`Offline study requires embedded resources: ${item.uri}`);
  }
  const unsupported = (document.extensionsRequired || []).filter((name) => ['KHR_draco_mesh_compression', 'EXT_meshopt_compression', 'KHR_texture_basisu'].includes(name));
  if (unsupported.length) throw new Error(`This offline build requires an uncompressed GLB without external decoders: ${unsupported.join(', ')}`);
}

function styles() {
  return `
*{box-sizing:border-box}
:root{font-family:Inter,"Pretendard","Segoe UI","Malgun Gothic",sans-serif;color:#353630;background:#f5f4ef;font-synthesis:none;--accent:#8c583f;--line:#dfdfd6;--muted:#77796f}
body{margin:0}
button,input,a{-webkit-tap-highlight-color:transparent}
button,input{font:inherit}
button{cursor:pointer;color:inherit}
button:disabled{cursor:wait}
button:focus-visible,a:focus-visible,input:focus-visible,canvas:focus-visible{outline:3px solid #a66949;outline-offset:4px}
button{border:0}
[hidden]{display:none!important}
.app-shell{max-width:1600px;margin:auto;padding:0 48px}
.topbar{height:90px;display:flex;align-items:center;justify-content:space-between;gap:24px;border-bottom:1px solid var(--line)}
.wordmark{display:flex;align-items:center;gap:9px;font-size:14px;font-weight:750;letter-spacing:1.8px;text-decoration:none;color:inherit;white-space:nowrap}
.wordmark-light{font-weight:400}
.brand-mark{font-family:Georgia,serif;font-size:32px;font-style:italic;font-weight:400;letter-spacing:-3px;margin-right:14px;transform:translateY(-3px)}
.topbar-sub{font-size:10px;letter-spacing:2px;color:var(--muted)}
.topbar-sub span{margin:0 12px;color:#b2b3a9}
.offline{display:flex;align-items:center;gap:8px;font-size:11px;color:#666b60;white-space:nowrap}
.offline>span{width:6px;height:6px;border-radius:50%;background:#798b6d}
.intro{display:flex;align-items:flex-end;justify-content:space-between;padding:35px 0 28px;gap:20px}
.eyebrow{font-size:9px;font-weight:650;letter-spacing:2.1px;color:var(--accent);margin:0 0 11px}
h1{font-size:34px;font-weight:550;letter-spacing:-1.8px;line-height:1.25;margin:0}
h1 span{font-weight:300;color:#8e9084;margin-left:5px}
.intro-note{text-align:right;padding-bottom:2px}
.study-tag{display:inline-block;border:1px solid #c9cbbf;border-radius:4px;font-size:10px;letter-spacing:.6px;padding:5px 8px;color:#65695d}
.intro-note p{font-size:11px;color:var(--muted);margin:10px 0 0}
.workspace{display:grid;grid-template-columns:minmax(0,1fr) 310px;border:1px solid #d8dbcf;border-radius:10px;overflow:hidden;background:#fafaf6;box-shadow:0 8px 28px #383c2c05}
.stage{position:relative;min-width:0;height:clamp(570px,69vh,850px);background:radial-gradient(ellipse at 48% 37%,#eeede6 0%,#dcded5 58%,#c9cec3 100%);isolation:isolate;overflow:hidden}
.stage[data-light=warm]{background:radial-gradient(ellipse at 48% 37%,#f3eadd 0%,#e5d9c8 58%,#d1c6b7 100%)}
.stage[data-light=cool]{background:radial-gradient(ellipse at 48% 37%,#e8edf0 0%,#d6dfe2 58%,#c2cdd2 100%)}
#study-canvas{position:absolute;inset:0;display:block;width:100%;height:100%;touch-action:none;cursor:grab;z-index:1}
#study-canvas:active{cursor:grabbing}
#study-canvas:focus-visible{outline-offset:-5px}
.stage-top{position:absolute;z-index:2;top:25px;left:27px;right:27px;display:flex;justify-content:space-between;pointer-events:none;font-size:9px;font-weight:500;letter-spacing:1.9px;color:#72786b}
.stage-top>span:first-child{display:flex;align-items:center;gap:7px}
.stage-top i{display:inline-block;width:5px;height:5px;background:#79886f;border-radius:50%}
.stage-guide{position:absolute;inset:76px 9% 94px;pointer-events:none;opacity:.4}
.stage-guide span{position:absolute;width:17px;height:17px;border:solid #929e8d}
.stage-guide span:nth-child(1){top:0;left:0;border-width:1px 0 0 1px}
.stage-guide span:nth-child(2){top:0;right:0;border-width:1px 1px 0 0}
.stage-guide span:nth-child(3){bottom:0;left:0;border-width:0 0 1px 1px}
.stage-guide span:nth-child(4){bottom:0;right:0;border-width:0 1px 1px 0}
.stage-bottom{position:absolute;bottom:23px;left:27px;right:27px;display:flex;align-items:flex-end;justify-content:space-between;z-index:2;pointer-events:none;color:#626a5d}
.stage-bottom>div:first-child{display:grid;gap:9px}
.stage-index{font-family:Georgia,serif;font-size:28px;line-height:1}.stage-index span{font-family:Inter,"Segoe UI",sans-serif;font-size:8px;letter-spacing:1.4px;margin-left:7px}
#stage-light{font-size:10px;letter-spacing:.3px}
.stage-actions{display:flex;gap:5px;pointer-events:auto}
.stage-actions button{width:36px;height:36px;border-radius:6px;background:#f8f9f0b5;border:1px solid #ffffff70;font-size:20px;font-weight:300;backdrop-filter:blur(8px)}
.stage-actions button:hover{background:#fffdf7}
.inspector{max-height:clamp(570px,69vh,850px);overflow-y:auto;scrollbar-width:thin;padding:27px 23px 22px;border-left:1px solid #d8dbcf;display:flex;flex-direction:column}
.panel-heading{display:flex;justify-content:space-between;gap:10px;align-items:center;margin-bottom:3px}
h2{font-size:13px;font-weight:650;margin:0;letter-spacing:-.3px}
.panel-heading>span{font-size:8px;color:#929488;letter-spacing:1px}
fieldset{border:0;padding:0;margin:0;min-width:0}
.control-section{padding:23px 0;border-bottom:1px solid #e3e5da}
h3{display:flex;align-items:center;gap:10px;font-size:11px;font-weight:650;margin:0 0 15px}
h3>span{color:#929987;font-family:Georgia,serif;font-size:12px;font-weight:400}
.segmented{display:flex;background:#eeefe7;padding:4px;border-radius:6px;gap:3px}
.segmented button{flex:1;min-height:37px;background:transparent;border-radius:4px;font-size:11px;color:#73776d}
button[aria-pressed=true]{background:#fffef9;box-shadow:0 1px 4px #444b2e12;color:#3c4835;font-weight:650}
.framing-row{display:flex;justify-content:space-between;align-items:center;margin-top:15px;font-size:11px;color:#6c7265}
.framing{display:flex;gap:2px}
.framing button{font-size:10px;border:1px solid transparent;padding:8px 11px;min-height:34px;background:transparent;border-radius:5px}
.framing button[aria-pressed=true]{border-color:#bdc5af;color:#4f6044;background:#eef1e5;box-shadow:none}
.light-options{display:grid;grid-template-columns:repeat(3,1fr);gap:7px}
.light-options button{border:1px solid #e3e5db;border-radius:7px;background:#f6f7f0;display:flex;align-items:center;flex-direction:column;gap:10px;padding:12px 0 10px;font-size:10px;color:#737b69}
.light-options button[aria-pressed=true]{border-color:#879775;background:#eff2e7;color:#3c5032;box-shadow:0 0 0 1px #87977515}
.light-orb{display:block;width:28px;height:28px;border-radius:50%;box-shadow:inset -3px -3px 6px #3237280d,0 2px 3px #242a1a0b}.light-orb.neutral{background:radial-gradient(circle at 32% 28%,#fffef5,#d4d7c9 75%)}.light-orb.warm{background:radial-gradient(circle at 32% 28%,#fff6dc,#d7b586 85%)}.light-orb.cool{background:radial-gradient(circle at 32% 28%,#f3fcff,#aabcc9 85%)}
.slider-row{display:grid;grid-template-columns:1fr auto;gap:8px;margin-top:18px;font-size:11px;align-items:center}
.slider-row label{color:#6c7265;overflow-wrap:anywhere}
.slider-row output{font-size:10px;color:#707866;font-variant-numeric:tabular-nums}
input[type=range]{grid-column:1/-1;width:100%;height:20px;margin:0;accent-color:#6d7f59;cursor:pointer}
.display-controls{padding-bottom:17px}
.display-controls h3{margin-bottom:10px}
.toggle-row{display:flex;align-items:center;justify-content:space-between;position:relative;min-height:37px;font-size:11px;color:#666e5e;cursor:pointer}
.toggle-row input{position:absolute;right:0;width:34px;height:24px;margin:0;opacity:0;cursor:pointer;z-index:1}
.switch{display:block;width:31px;height:18px;background:#d9ddd0;border-radius:20px;transition:background .15s;position:relative}
.switch:after{content:"";position:absolute;width:12px;height:12px;border-radius:50%;top:3px;left:3px;background:#fffffb;box-shadow:0 1px 2px #383f2d20;transition:transform .15s}
.toggle-row input:checked+.switch{background:#768761}
.toggle-row input:checked+.switch:after{transform:translateX(13px)}
.toggle-row input:focus-visible+.switch{outline:3px solid #a66949;outline-offset:4px}
.panel-note{display:flex;gap:9px;align-items:flex-start;margin-top:auto;padding-top:25px;color:#858a7d}
.note-mark{font-size:17px;line-height:1.3;color:#899779}
.panel-note p{font-size:10px;line-height:1.8;margin:0;word-break:keep-all}
.under-stage{display:flex;justify-content:space-between;gap:15px;padding:15px 1px}
#canvas-help{font-size:10px;color:#858a7e;line-height:1.7;margin:0}
#canvas-help>span:first-child{font-size:14px;margin-right:4px;color:#67745a}
.ready-status{display:flex;align-items:center;gap:6px;font-size:10px;color:#7c8472;white-space:nowrap}
.ready-status i{width:5px;height:5px;border-radius:50%;background:#a5aa9d}
body[data-ready=true] .ready-status i{background:#7b8f66}
body[data-status=error] .ready-status i{background:#aa6550}
footer{display:flex;justify-content:space-between;border-top:1px solid var(--line);margin-top:24px;padding:20px 0 27px;font-size:8px;letter-spacing:1px;color:#93998a}
.footer-divider{margin:0 12px;color:#b5b9ac}
.notice{position:absolute;z-index:4;top:50%;left:50%;transform:translate(-50%,-50%);width:min(370px,calc(100% - 48px));padding:27px;background:#fffff5ee;border:1px solid #d2d9c7;border-radius:12px;box-shadow:0 12px 42px #3e493e14;text-align:center;backdrop-filter:blur(12px)}
.notice-symbol{font-size:30px;color:#82956e}
.notice p{font-size:12px;line-height:1.8;overflow-wrap:anywhere;color:#626b58}.notice button{background:#657654;color:#fff;padding:10px 16px;border-radius:5px;font-size:12px;min-height:40px;margin-top:4px}.sr-only{position:absolute;width:1px;height:1px;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap}.skip-link{position:fixed;z-index:10;top:-100px;left:20px;padding:12px;background:#fff;color:#3c5032}.skip-link:focus{top:10px}.noscript{position:fixed;inset:30% 10% auto;z-index:9;background:#fff6dc;border:1px solid #b8a47e;padding:30px;text-align:center;font-size:16px}
@media(min-width:1500px){.workspace{grid-template-columns:minmax(0,1fr) 330px}.inspector{padding:30px 28px}}
@media(max-width:1100px){.app-shell{padding:0 28px}.workspace{grid-template-columns:minmax(0,1fr) 285px}.inspector{padding:25px 19px}.keyboard-help{display:none}.topbar-sub{display:none}}
@media(max-width:760px){.app-shell{padding:0 18px}.topbar{height:68px;gap:10px}.wordmark{font-size:11px;letter-spacing:1px;gap:6px}.brand-mark{font-size:28px;margin-right:7px}.offline{font-size:9px;gap:5px}.intro{padding:27px 0 22px;align-items:center}.eyebrow{font-size:8px;letter-spacing:1.3px;margin-bottom:9px}h1{font-size:27px;letter-spacing:-1px}.intro-note p{display:none}.study-tag{font-size:9px;padding:5px 6px}.workspace{display:flex;flex-direction:column}.stage{height:clamp(440px,68svh,680px)}.stage-top{top:21px;left:20px;right:20px;font-size:8px}.stage-bottom{left:20px;right:20px;bottom:19px}.stage-guide{inset:65px 7% 88px}.inspector{max-height:none;overflow-y:visible;border-left:0;border-top:1px solid #d8dbcf;padding:25px 22px}.panel-heading{margin-bottom:0}.panel-heading>span{font-size:9px}#study-settings{display:grid;grid-template-columns:1fr 1fr;column-gap:24px}.control-section{padding:21px 0}.control-section h3{font-size:12px}.segmented button{font-size:11px;min-height:40px}.framing-row{font-size:11px}.display-controls{grid-column:1/-1;display:grid;grid-template-columns:repeat(3,1fr);gap:10px}.display-controls h3{grid-column:1/-1;margin-bottom:0}.toggle-row{font-size:11px;gap:10px}.panel-note{padding-top:20px}.panel-note p br{display:none}.under-stage{align-items:flex-start;padding-top:13px}.ready-status{font-size:9px;padding-top:5px}#canvas-help{max-width:73%;font-size:9px}footer{margin-top:18px;font-size:7px;gap:15px;line-height:1.7}.footer-divider{margin:0 5px}}
@media(max-width:460px){.app-shell{padding:0 13px}.offline{font-size:8px}.wordmark{font-size:10px}.workspace{border-radius:8px}.stage{height:clamp(430px,66svh,600px)}.inspector{padding:23px 20px}#study-settings{display:block}.control-section{padding:21px 0}.display-controls{display:block}.display-controls h3{margin-bottom:10px}.toggle-row{min-height:42px;font-size:12px}.light-options button{flex-direction:row;justify-content:center;gap:10px;padding:13px 0}.light-orb{width:22px;height:22px}.segmented button{font-size:12px}.framing button{min-height:38px;font-size:11px}.slider-row{font-size:12px}.study-tag{font-size:8px}.stage-actions button{width:38px;height:38px}.intro-note{max-width:85px}}
@media(prefers-reduced-motion:reduce){*,*:before,*:after{transition:none!important;scroll-behavior:auto!important}}`;
}
