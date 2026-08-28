(()=>{
'use strict';
const PASS='1018';
const KEY='pro-install-unlocked-v1';
function standalone(){return window.matchMedia?.('(display-mode: standalone)').matches||navigator.standalone===true}
function make(){if(standalone()||document.getElementById('proInstallBtn'))return;const h=document.querySelector('header .w')||document.querySelector('header')||document.body;const b=document.createElement('button');b.id='proInstallBtn';b.type='button';b.textContent='PROアプリをダウンロード';b.style.cssText='width:100%;margin-top:12px;padding:12px;border:1px solid #e7c94d;border-radius:10px;background:#17191c;color:#ffd75e;font-weight:900;font-size:15px;box-sizing:border-box';b.onclick=()=>{const v=prompt('PROアプリのダウンロードパスワードを入力してください');if(v===null)return;if(v!==PASS){alert('パスワードが違います。');return}try{sessionStorage.setItem(KEY,'1')}catch{}location.href='./install.html'};h.appendChild(b)}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',make);else make();
})();