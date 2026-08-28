(()=>{
'use strict';
const PASS='1018';
const DOWNLOAD_SELECTOR='a[download],button[id*="Csv"],button[id*="Backup"],button[data-share],button[data-mail],button[data-copy]';
function ask(){
  const v=window.prompt('ダウンロード・共有パスワードを入力してください');
  if(v===null)return false;
  if(v===PASS)return true;
  alert('パスワードが違います。');
  return false;
}
function isProtected(el){
  if(!el)return false;
  if(el.matches?.(DOWNLOAD_SELECTOR))return true;
  const txt=(el.textContent||'').trim();
  return /CSV|バックアップ|ダウンロード|共有|メール/.test(txt);
}
document.addEventListener('click',e=>{
  const el=e.target.closest?.('button,a');
  if(!isProtected(el))return;
  if(ask())return;
  e.preventDefault();
  e.stopImmediatePropagation();
},true);
})();