import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const html = await readFile(path.join(root, "index.private.html"), "utf8");
const bundle = html.slice(
  html.indexOf("<!-- FORM_AVATAR_START -->"),
  html.indexOf("<!-- FORM_AVATAR_END -->"),
);
const css = html.match(/<style>([\s\S]*?)<\/style>/)[1];
await writeFile(
  path.join(root, "private-preview.html"),
  `<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>FORM · 아이온2 로컬 모델</title><style>${css}
body{padding:24px;max-width:1200px;margin:auto}h1{font-size:28px}.preview-grid{display:grid;grid-template-columns:1fr 1fr;gap:24px}.avatar-stage{height:clamp(320px,54vh,560px)!important}.avatar-view{max-width:none!important}.preview-actions{display:flex;flex-wrap:wrap;gap:12px;margin:18px 0;align-items:center}.preview-actions button{padding:12px;background:#ccff00;color:#111;border:0;border-radius:10px}#evidence{font-size:12px;white-space:pre-wrap}@media(max-width:700px){.preview-grid{grid-template-columns:1fr}.avatar-stage{height:500px!important}}
</style><h1>FORM / 아이온2 캐릭터 스튜디오</h1><p>얼굴과 체형을 고르고, 운동할 때의 모습을 확인하세요.</p><div class="preview-actions"><label>스타일 <select id="shape-preset" aria-label="체형 프리셋"></select></label><button id="squat">스쿼트</button><button id="pushup">푸시업</button><button id="snapshot" disabled>화면 저장</button><span id="download"></span><a href="index.private.html">얼굴·체형 세부 편집 ↗</a></div><div class="preview-grid"><section id="portrait"></section><section id="motion"></section></div><p id="evidence" role="status"></p>${bundle}<script>
const b={model:'female',height:175,weight:56,privateShape:FormAvatar.privateShapePreset('curvy'),appearance:{hairColor:'#4a352c',eyeColor:'#60452f'}};
let motion,portrait,current='squat';const snapshot=document.getElementById('snapshot');function ready(){snapshot.disabled=!(portrait?.ready&&motion?.ready);}
function showPortrait(){portrait?.dispose();const p=document.getElementById('portrait');p.innerHTML=FormAvatar.markup('calf',false,'creator');portrait=FormAvatar.mount(p.firstElementChild,b,ready);}
const presets=document.getElementById('shape-preset');presets.innerHTML=FormAvatar.PRIVATE_SHAPE_PRESETS.map(p=>'<option value="'+p.id+'">'+p.name+'</option>').join('');presets.value='curvy';presets.onchange=()=>{b.privateShape=FormAvatar.privateShapePreset(presets.value);showPortrait();show(current);};showPortrait();
function show(id){current=id;snapshot.disabled=true;document.getElementById('download').replaceChildren();motion?.dispose();for(const name of ['squat','pushup'])document.getElementById(name).setAttribute('aria-pressed',String(id===name));const m=document.getElementById('motion');m.innerHTML=FormAvatar.markup(id);motion=FormAvatar.mount(m.firstElementChild,b,()=>{ready();document.getElementById('evidence').textContent=presets.selectedOptions[0].text+' · '+(id==='squat'?'스쿼트':'푸시업')+' · 드래그로 회전하거나 동작 구간을 움직여 자세를 확인하세요.';});}
document.getElementById('snapshot').onclick=async()=>{
 const images=await Promise.all([portrait,motion].map(api=>new Promise(resolve=>{const im=new Image();im.onload=()=>resolve(im);im.src=api.capture();})));
 const c=document.createElement('canvas');c.width=1400;c.height=900;const d=c.getContext('2d');d.fillStyle='#111a16';d.fillRect(0,0,1400,900);d.fillStyle='#ccff00';d.font='bold 30px sans-serif';d.fillText('FORM / AION 2',32,48);d.fillStyle='#eaf0e8';d.font='18px sans-serif';d.fillText('Local workout app · Actual WebGL render',32,80);
 images.forEach((im,i)=>{const w=660,h=740,scale=Math.min(w/im.width,h/im.height);d.drawImage(im,32+i*688+(w-im.width*scale)/2,110+(h-im.height*scale)/2,im.width*scale,im.height*scale);});
 const link=document.createElement('a');link.href=c.toDataURL('image/png');link.download='form-aion2-preview.png';link.textContent='PNG 다운로드';document.getElementById('download').replaceChildren(link);
};
document.getElementById('squat').onclick=()=>show('squat');document.getElementById('pushup').onclick=()=>show('pushup');show('squat');
</script></html>`,
);
