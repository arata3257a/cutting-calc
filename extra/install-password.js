(()=>{
'use strict';
const PASS='1018';
const UNLOCK='extra-install-unlocked-v1';
let deferred=null;

function unlocked(){try{return sessionStorage.getItem(UNLOCK)==='1'}catch{return false}}
function setUnlock(){try{sessionStorage.setItem(UNLOCK,'1')}catch{}}
function clearUnlock(){try{sessionStorage.removeItem(UNLOCK)}catch{}}
function standalone(){return window.matchMedia?.('(display-mode: standalone)').matches||navigator.standalone===true}
function manifestLink(){return document.querySelector('link[rel="manifest"]')}
function enableInstallManifest(){
  let l=manifestLink();
  if(!l){l=document.createElement('link');l.rel='manifest';document.head.appendChild(l)}
  l.href='manifest-install.json?v=1';
  if('serviceWorker' in navigator)navigator.serviceWorker.register('./service-worker.js').catch(()=>{});
}
function installBtn(){return document.getElementById('extraInstallBtn')}
function label(){
  const b=installBtn();if(!b)return;
  b.textContent=unlocked()?'アプリをインストール':'アプリをダウンロード';
}
function makeButton(){
  if(standalone()||installBtn())return;
  const h=document.querySelector('header .w')||document.querySelector('header')||document.body;
  const b=document.createElement('button');
  b.id='extraInstallBtn';b.type='button';
  b.style.cssText='width:100%;margin-top:12px;padding:12px;border:1px solid #e7c94d;border-radius:10px;background:#17191c;color:#ffd75e;font-weight:900;font-size:15px;box-sizing:border-box';
  b.onclick=async()=>{
    if(!unlocked()){
      const v=prompt('アプリのダウンロードパスワードを入力してください');
      if(v===null)return;
      if(v!==PASS){alert('パスワードが違います。');return}
      setUnlock();
      enableInstallManifest();
      label();
      alert('認証しました。\n「アプリをインストール」をもう一度押してください。');
      return;
    }
    enableInstallManifest();
    if(deferred){
      const p=deferred;deferred=null;
      try{await p.prompt();await p.userChoice}catch{}
      return;
    }
    alert('インストールの準備中です。数秒待ってもう一度押してください。\n表示されない場合はブラウザのメニューから「アプリをインストール」を選んでください。');
  };
  h.appendChild(b);label();
}

window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferred=e;label()});
window.addEventListener('appinstalled',()=>{clearUnlock();deferred=null;const b=installBtn();if(b)b.remove()});

if(unlocked())enableInstallManifest();
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',makeButton);else makeButton();
})();