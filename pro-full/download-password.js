(()=>{
'use strict';
const PASS='1018';
const SEL='a[download],button[id*="Csv"],button[id*="Backup"],button[data-share],button[data-mail],button[data-copy]';
document.addEventListener('click',e=>{const el=e.target.closest?.('button,a');if(!el)return;const txt=(el.textContent||'').trim();if(!el.matches?.(SEL)&&!/CSV|バックアップ|ダウンロード|共有|メール|コピー/.test(txt))return;const v=prompt('ダウンロード・共有パスワードを入力してください');if(v===null||v!==PASS){e.preventDefault();e.stopImmediatePropagation();if(v!==null)alert('パスワードが違います。')}},true);
})();