(()=>{
'use strict';
const CODE=String.fromCharCode(49,57,56,52);
const PROTECTED_SELECTOR='a[download],button[id*="Csv"],button[id*="Backup"],button[data-share],button[data-mail],button[data-copy]';

function ask(){
  const v=window.prompt('ダウンロード・共有パスワードを入力してください');
  if(v===null)return false;
  if(v===CODE)return true;
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
document.addEventListener('click',e=>{
  const el=e.target.closest?.('button,a');
  if(!el||(!el.matches?.(PROTECTED_SELECTOR)&&kind(el)==='none'))return;
  const k=kind(el);
  if(k==='none')return;
  if(!ask()){
    e.preventDefault();e.stopImmediatePropagation();
  }
},true);
})();