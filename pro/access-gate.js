(()=>{
'use strict';
const START_KEY='cutting-pro-trial-start-v1';
const MAX_KEY='cutting-pro-max-time-v1';
const TERM=7*24*60*60*1000;
function getNum(k){try{return Number(localStorage.getItem(k)||0)}catch{return 0}}
function setNum(k,v){try{localStorage.setItem(k,String(v))}catch{}}
let now=Date.now();
const maxSeen=getNum(MAX_KEY);if(maxSeen>now)now=maxSeen;setNum(MAX_KEY,now);
let start=getNum(START_KEY);if(!start){start=now;setNum(START_KEY,start)}
const end=start+TERM;
if(now>=end){location.replace('./expired.html');return}
function paint(){
  document.title='切削加工条件計算 EXTRA お試し';
  const tag=document.querySelector('.head .tag');if(tag){tag.textContent='EXTRA お試し';tag.style.background='#d4af37';tag.style.color='#202226';tag.style.padding='4px 10px';tag.style.borderRadius='99px';tag.style.fontSize='12px';tag.style.fontStyle='normal';tag.style.letterSpacing='.5px';tag.style.transform='none'}
  const h=document.querySelector('.head h1');if(h)h.textContent='切削加工条件計算';
  const remain=Math.max(0,end-now),days=Math.ceil(remain/(24*60*60*1000));
  if(!document.getElementById('proTrialStatus')){const box=document.createElement('div');box.id='proTrialStatus';box.style.cssText='max-width:620px;margin:10px auto 0;padding:10px 14px;box-sizing:border-box;background:#282b30;border:1px solid #8a6f22;border-radius:10px;color:#ffe28a;font-weight:800;font-size:13px';box.textContent=`EXTRA お試し｜有効期限：あと${days}日`;const main=document.querySelector('main.w');if(main)main.insertAdjacentElement('afterbegin',box)}
  document.querySelectorAll('.card.note').forEach(x=>{if(/EXTRA版|PRO/.test(x.textContent||''))x.innerHTML='<b>EXTRA お試し 7日間版</b><br>初回利用から7日間ご利用いただけます。'})
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(paint,0));else setTimeout(paint,0);
})();