(()=>{
'use strict';
const KEY='cutting-extra-history-v1';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function load(){try{const v=JSON.parse(localStorage.getItem(KEY)||'[]');return Array.isArray(v)?v:[]}catch{return[]}}
function row(id){return load().find(r=>r.id===id)}
function title(r){return (r.memo||r.matLabel||'加工条件').trim()}
function body(r){return [
`EXTRA 保存加工条件`,
`条件名：${title(r)}`,
`被削材：${r.matLabel||''}`,
`加工方法：${r.opLabel||''}`,
`工具径 D：${r.d} mm`,
`刃数 Z：${r.z}`,
`切削速度 Vc：${r.vc} m/min`,
`1刃送り fz：${r.fz} mm/刃`,
`軸方向切込み ap：${r.ap} mm`,
`径方向切込み ae：${r.ae} mm`,
`回転数 N：${Number(r.n||0).toLocaleString()} rpm`,
`送り速度 F：${Number(r.f||0).toLocaleString()} mm/min`,
`突出し量：${r.stick} mm`,
`最高回転数：${r.maxn} rpm`,
`加工長さ：${r.len} mm`,
`クーラント：${r.cool||''}`
].join('\n')}
function csv(r){const vals=['条件名','被削材','加工方法','D(mm)','Z','Vc(m/min)','fz(mm/刃)','ap(mm)','ae(mm)','N(rpm)','F(mm/min)','突出し(mm)','最高回転数(rpm)','加工長さ(mm)','クーラント'];const data=[title(r),r.matLabel,r.opLabel,r.d,r.z,r.vc,r.fz,r.ap,r.ae,r.n,r.f,r.stick,r.maxn,r.len,r.cool];const cell=v=>{const s=String(v??'');return /[",\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s};return '\ufeff'+vals.map(cell).join(',')+'\r\n'+data.map(cell).join(',')}
function safeName(s){return String(s||'加工条件').replace(/[\\/:*?"<>|]/g,'_').slice(0,40)}
function fileFor(r){return new File([csv(r)],`EXTRA_${safeName(title(r))}.csv`,{type:'text/csv;charset=utf-8'})}
async function share(r){const text=body(r),file=fileFor(r);try{
  if(navigator.share){
    const payload={title:`EXTRA ${title(r)}`,text};
    if(navigator.canShare?.({files:[file]}))payload.files=[file];
    await navigator.share(payload);return;
  }
}catch(e){if(e?.name==='AbortError')return}
try{await navigator.clipboard.writeText(text);alert('共有機能が使えないため、加工条件をコピーしました。')}catch{download(r)}
}
function mail(r){const subject=encodeURIComponent(`EXTRA 加工条件：${title(r)}`);const b=encodeURIComponent(body(r)+'\n\n※CSV添付が必要な場合は「共有」ボタンからGmail等を選択してください。');location.href=`mailto:?subject=${subject}&body=${b}`}
function copy(r){const t=body(r);if(navigator.clipboard?.writeText)navigator.clipboard.writeText(t).then(()=>alert('加工条件をコピーしました。')).catch(()=>fallbackCopy(t));else fallbackCopy(t)}
function fallbackCopy(t){const a=document.createElement('textarea');a.value=t;a.style.position='fixed';a.style.opacity='0';document.body.appendChild(a);a.select();document.execCommand('copy');a.remove();alert('加工条件をコピーしました。')}
function download(r){const blob=new Blob([csv(r)],{type:'text/csv;charset=utf-8'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`EXTRA_${safeName(title(r))}.csv`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}
function enhance(){document.querySelectorAll('.hx-row').forEach(box=>{if(box.querySelector('[data-share]'))return;const restore=box.querySelector('[data-restore]');if(!restore)return;const id=restore.dataset.restore,actions=restore.parentElement;if(!actions)return;const wrap=document.createElement('div');wrap.className='hx-share-actions';wrap.innerHTML=`<button type="button" data-share="${esc(id)}">共有</button><button type="button" data-mail="${esc(id)}">メール</button><button type="button" data-copy="${esc(id)}">コピー</button>`;actions.insertAdjacentElement('afterend',wrap)})}
function style(){if(document.getElementById('hxShareStyle'))return;const s=document.createElement('style');s.id='hxShareStyle';s.textContent='.hx-share-actions{display:grid;grid-template-columns:1fr 1fr 1fr;gap:7px;margin-top:7px}.hx-share-actions button{border:1px solid #6b7077;border-radius:9px;padding:9px 6px;background:#30343a;color:#f1f3f5;font-weight:800;font-size:12px}.hx-share-actions button:first-child{border-color:#d4af37;color:#ffd75e}@media(max-width:360px){.hx-share-actions{grid-template-columns:1fr}.hx-share-actions button{padding:9px}}';document.head.appendChild(s)}
function init(){style();enhance();const obs=new MutationObserver(enhance);const list=document.getElementById('historyList');if(list)obs.observe(list,{childList:true,subtree:true});document.addEventListener('click',e=>{const b=e.target.closest?.('[data-share],[data-mail],[data-copy]');if(!b)return;const id=b.dataset.share||b.dataset.mail||b.dataset.copy,r=row(id);if(!r)return;if(b.dataset.share)share(r);else if(b.dataset.mail)mail(r);else copy(r)})}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(init,0));else setTimeout(init,0)
})();