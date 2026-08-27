(()=>{
'use strict';
const KEY='cutting-extra-history-v1';
const MAX=500;
const byId=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num=id=>Number(byId(id)?.value||0);
const text=id=>byId(id)?.value??'';
const selected=id=>{const e=byId(id);return e?.options?.[e.selectedIndex]?.text||''};
function load(){try{const v=JSON.parse(localStorage.getItem(KEY)||'[]');return Array.isArray(v)?v:[]}catch{return[]}}
function store(v){localStorage.setItem(KEY,JSON.stringify(v.slice(0,MAX)))}
function nowLabel(ts){try{return new Date(ts).toLocaleString('ja-JP',{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'})}catch{return''}}
function current(){
 const n=(byId('n')?.textContent||'').replace(/,/g,'');
 const f=(byId('f')?.textContent||'').replace(/,/g,'');
 if(!n||n==='---'||!f||f==='---')return null;
 return {
  id:(crypto.randomUUID?.()||Date.now()+'-'+Math.random().toString(16).slice(2)),createdAt:new Date().toISOString(),
  memo:text('historyMemo').trim(),mode:text('mode'),mat:text('mat'),matLabel:selected('mat'),op:text('op'),opLabel:selected('op'),
  d:num('d'),z:num('z'),vc:num('vc'),fz:num('fz'),ap:num('ap'),ae:num('ae'),stick:num('stick'),maxn:num('maxn'),len:num('len'),cool:text('cool'),
  n:Number(n),f:Number(f),time:Number((byId('time')?.textContent||'0').replace(/,/g,''))||0
 };
}
function setMsg(msg,cls='good'){const e=byId('historyMsg');if(e)e.innerHTML=`<span class="${cls}">${esc(msg)}</span>`}
function saveCurrent(){const r=current();if(!r){setMsg('先に使用条件を計算してください。','warn');return}const v=load();v.unshift(r);store(v);byId('historyMemo').value='';render();setMsg('この条件を保存しました。')}
function restore(id){const r=load().find(x=>x.id===id);if(!r)return;
 if(byId('mode'))byId('mode').value='manual';
 if(typeof window.syncMode==='function')window.syncMode();
 ['d','z','vc','fz','ap','ae','stick','maxn','len'].forEach(k=>{if(byId(k)&&r[k]!=null)byId(k).value=r[k]});
 if(byId('mat')&&r.mat)byId('mat').value=r.mat;
 if(byId('op')&&r.op)byId('op').value=r.op;
 if(byId('cool')&&r.cool)byId('cool').value=r.cool;
 if(typeof window.calc==='function')window.calc();
 window.scrollTo({top:0,behavior:'smooth'});setMsg('保存条件を手入力モードで再呼び出しました。')
}
function removeOne(id){store(load().filter(x=>x.id!==id));render();setMsg('履歴を1件削除しました。')}
function csvCell(v){const s=String(v??'');return /[",\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s}
function csvText(){const rows=load();const head=['保存日時','メモ','被削材','加工方法','工具径D(mm)','刃数Z','Vc(m/min)','fz(mm/刃)','ap(mm)','ae(mm)','突出し(mm)','最高回転数(rpm)','加工長さ(mm)','クーラント','使用回転数N(rpm)','使用送りF(mm/min)','加工時間(秒)'];const body=rows.map(r=>[nowLabel(r.createdAt),r.memo,r.matLabel,r.opLabel,r.d,r.z,r.vc,r.fz,r.ap,r.ae,r.stick,r.maxn,r.len,r.cool,r.n,r.f,r.time].map(csvCell).join(','));return '\ufeff'+[head.join(','),...body].join('\r\n')}
async function saveFile(name,type,data){
 if(window.showSaveFilePicker){try{const h=await showSaveFilePicker({suggestedName:name,types:[{description:type,accept:{[type]:[name.endsWith('.csv')?'.csv':'.json']}}]});const w=await h.createWritable();await w.write(data);await w.close();return true}catch(e){if(e?.name==='AbortError')return false}}
 const blob=new Blob([data],{type});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),1000);return true
}
async function exportCsv(){if(!load().length){setMsg('保存履歴がありません。','warn');return}if(await saveFile('EXTRA_加工条件履歴.csv','text/csv',csvText()))setMsg('CSVを書き出しました。')}
async function exportJson(){const rows=load();if(!rows.length){setMsg('保存履歴がありません。','warn');return}const data=JSON.stringify({app:'cutting-extra',version:1,exportedAt:new Date().toISOString(),records:rows},null,2);if(await saveFile('EXTRA_加工条件バックアップ.json','application/json',data))setMsg('バックアップを書き出しました。')}
function importJson(file){const rd=new FileReader();rd.onload=()=>{try{const j=JSON.parse(rd.result);const rows=Array.isArray(j)?j:j.records;if(!Array.isArray(rows))throw new Error();const clean=rows.filter(r=>r&&typeof r==='object'&&r.d!=null&&r.n!=null).map(r=>({...r,id:r.id||(crypto.randomUUID?.()||Date.now()+'-'+Math.random())}));const merged=[...clean,...load()];const seen=new Set();store(merged.filter(r=>{const k=r.id;if(seen.has(k))return false;seen.add(k);return true}));render();setMsg(`${clean.length}件を読み込みました。`)}catch{setMsg('バックアップファイルを読み込めませんでした。','bad')}};rd.readAsText(file)}
function render(){const box=byId('historyList');if(!box)return;const rows=load();byId('historyCount').textContent=`${rows.length}件保存`;if(!rows.length){box.innerHTML='<div class="hx-empty">まだ保存履歴はありません。</div>';return}box.innerHTML=rows.map(r=>`<div class="hx-row"><div class="hx-top"><b>${esc(r.memo||r.matLabel||'加工条件')}</b><span>${esc(nowLabel(r.createdAt))}</span></div><div class="hx-sub">${esc(r.matLabel)} / ${esc(r.opLabel)} / φ${esc(r.d)} / ${esc(r.z)}枚刃</div><div class="hx-values">N ${Number(r.n||0).toLocaleString()} rpm　F ${Number(r.f||0).toLocaleString()} mm/min　ap ${esc(r.ap)}　ae ${esc(r.ae)}</div><div class="hx-actions"><button data-restore="${esc(r.id)}">再呼び出し</button><button class="danger" data-delete="${esc(r.id)}">削除</button></div></div>`).join('');box.querySelectorAll('[data-restore]').forEach(b=>b.onclick=()=>restore(b.dataset.restore));box.querySelectorAll('[data-delete]').forEach(b=>b.onclick=()=>removeOne(b.dataset.delete))}
function build(){if(byId('historyCard'))return;const style=document.createElement('style');style.textContent='.hx-tools{display:grid;grid-template-columns:1fr 1fr;gap:8px}.hx-tools button,.hx-actions button{border:0;border-radius:9px;padding:11px;font-weight:800}.hx-primary{background:#d4af37;color:#2b2d30}.hx-secondary{background:#5b6067;color:#fff}.hx-row{background:#393d42;border:1px solid #5c6168;border-radius:10px;padding:10px;margin-top:9px}.hx-top{display:flex;justify-content:space-between;gap:8px;align-items:start}.hx-top span,.hx-sub,.hx-values,.hx-empty{font-size:11px;color:#c0c4c8}.hx-sub{margin-top:4px}.hx-values{margin-top:5px;color:#f1f3f5}.hx-actions{display:grid;grid-template-columns:1fr auto;gap:8px;margin-top:8px}.hx-actions button{background:#5b6067;color:white;padding:9px}.hx-actions .danger{background:#70434a}.hx-count{font-size:11px;color:#c0c4c8;font-weight:400;margin-left:6px}@media(max-width:390px){.hx-tools{grid-template-columns:1fr 1fr}}';document.head.appendChild(style);
 const card=document.createElement('div');card.id='historyCard';card.className='card';card.innerHTML='<div class="sec">④ 条件を保存・履歴 <span id="historyCount" class="hx-count"></span></div><label>メモ（任意）</label><input id="historyMemo" type="text" maxlength="60" placeholder="例：SUS304 荒加工 良好条件"><button id="historySave" class="btn" type="button">この条件を保存</button><div class="hx-tools" style="margin-top:9px"><button id="historyCsv" class="hx-secondary" type="button">CSV出力</button><button id="historyBackup" class="hx-secondary" type="button">バックアップ</button><button id="historyImportBtn" class="hx-secondary" type="button">バックアップ読込</button><button id="historyClear" class="hx-secondary" type="button">履歴を全削除</button></div><input id="historyImport" type="file" accept="application/json,.json" class="hide"><div id="historyMsg" class="note" style="margin-top:9px"></div><div id="historyList"></div>';
 const cards=[...document.querySelectorAll('.card')];const result=cards.find(c=>c.querySelector('.sec')?.textContent.trim()==='使用条件');if(result)result.insertAdjacentElement('afterend',card);else document.querySelector('main')?.appendChild(card);
 byId('historySave').onclick=saveCurrent;byId('historyCsv').onclick=exportCsv;byId('historyBackup').onclick=exportJson;byId('historyImportBtn').onclick=()=>byId('historyImport').click();byId('historyImport').onchange=e=>{const f=e.target.files?.[0];if(f)importJson(f);e.target.value=''};byId('historyClear').onclick=()=>{if(confirm('保存した履歴をすべて削除しますか？')){localStorage.removeItem(KEY);render();setMsg('履歴をすべて削除しました。')}};render()
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',build);else build();
})();