(()=>{
'use strict';
const KEY='cutting-extra-history-v1';
function ensureBanner(){
  if(document.getElementById('recalledDataName')) return document.getElementById('recalledDataName');
  const firstCard=[...document.querySelectorAll('main>.card')].find(c=>c.querySelector('.sec')?.textContent.trim()==='① 条件を選ぶ');
  if(!firstCard) return null;
  const box=document.createElement('div');
  box.id='recalledDataName';
  box.style.cssText='display:none;margin:0 0 10px;padding:10px 12px;border:1px solid #d4af37;border-radius:10px;background:#393d42;color:#ffd75e;font-size:13px;font-weight:800;line-height:1.45;overflow-wrap:anywhere';
  firstCard.prepend(box);
  return box;
}
function showName(id){
  try{
    const rows=JSON.parse(localStorage.getItem(KEY)||'[]');
    const r=Array.isArray(rows)?rows.find(x=>x.id===id):null;
    if(!r)return;
    const name=(r.memo||r.matLabel||'保存データ').trim();
    const box=ensureBanner();
    if(!box)return;
    box.textContent='呼び出し中：'+name;
    box.style.display='block';
  }catch{}
}
function init(){
  ensureBanner();
  document.addEventListener('click',e=>{
    const b=e.target.closest?.('[data-restore]');
    if(!b)return;
    showName(b.dataset.restore);
  },true);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();