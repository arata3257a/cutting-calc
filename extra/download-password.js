(()=>{
'use strict';
const PASS='1018';
const ACCESS_KEY='extra-access-granted-v1';
const USED_KEY='extra-download-used-v1';
const PROTECTED_SELECTOR='a[download],button[id*="Csv"],button[id*="Backup"],button[data-share],button[data-mail],button[data-copy]';

function ask(){
  const v=window.prompt('ダウンロード・共有パスワードを入力してください');
  if(v===null)return false;
  if(v===PASS)return true;
  alert('パスワードが違います。');
  return false;
}
function kind(el){
  if(!el)return 'none';
  if(el.matches?.('a[download],button[id*="Csv"],button[id*="Backup"]'))return 'download';
  if(el.matches?.('button[data-share]'))return 'share';
  if(el.matches?.('button[data-mail],button[data-copy]'))return 'other';
  const txt=(el.textContent||'').trim();
  if(/CSV|バックアップ|ダウンロード/.test(txt))return 'download';
  if(/共有/.test(txt))return 'share';
  if(/メール|コピー/.test(txt))return 'other';
  return 'none';
}
function isUsed(){try{return localStorage.getItem(USED_KEY)==='1'}catch{return false}}
function revoke(){
  try{localStorage.setItem(USED_KEY,'1');localStorage.removeItem(ACCESS_KEY)}catch{}
}
function deny(){alert('この端末ではダウンロード済みです。\nダウンロードは1端末につき1回までです。')}
function finish(k){
  revoke();
  setTimeout(()=>location.replace('./complete.html'),k==='share'?5000:1200);
}
document.addEventListener('click',e=>{
  const el=e.target.closest?.('button,a');
  if(!el||(!el.matches?.(PROTECTED_SELECTOR)&&kind(el)==='none'))return;
  const k=kind(el);
  if(k==='none')return;
  if((k==='download'||k==='share')&&isUsed()){
    e.preventDefault();e.stopImmediatePropagation();deny();return;
  }
  if(!ask()){
    e.preventDefault();e.stopImmediatePropagation();return;
  }
  if(k==='download'||k==='share')finish(k);
},true);
})();