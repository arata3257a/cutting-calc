(()=>{'use strict';
let promptEvent=null;
const btn=document.getElementById('install-btn'),openChrome=document.getElementById('open-chrome'),status=document.getElementById('install-status'),instructions=document.getElementById('instructions');
const installUrl='https://arata3257a.github.io/cutting-calc/kaginote/install.html';
const ua=navigator.userAgent||'';
const android=/Android/i.test(ua);
openChrome.hidden=!android;
if(android){
 instructions.textContent='① この画面がChatGPTなどのアプリ内ブラウザーなら、右上「︙」→「Chromeで開く」または「ブラウザで開く」を選択\n② Chromeの右上「︙」をタップ\n③「アプリをインストール」または「ホーム画面に追加」を選択\n④ ホーム画面の「鍵ノート」から起動\n\nChromeで開けない場合は、右上「︙」の「ブラウザで開く」を選ぶか、Chromeのアドレス欄に鍵ノートのURLを入力してください。';
}else if(/iPhone|iPad|iPod/i.test(ua)){
 instructions.textContent='① Safariで鍵ノートを開く\n② 共有メニューから「ホーム画面に追加」\n③「追加」を選択\n④ 追加された鍵ノートから起動';
}else{
 instructions.textContent='① ChromeまたはEdgeで開く\n② アドレスバーのインストールアイコンかメニューの「アプリをインストール」を選択\n③ インストールした鍵ノートをアプリ一覧から起動';
}
if(window.matchMedia?.('(display-mode: standalone)').matches||navigator.standalone===true){location.replace('./index.html?from=installed-app')}
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();promptEvent=e;btn.textContent='📲 アプリをインストール';status.textContent='このブラウザーから直接インストールできます。';});
window.addEventListener('appinstalled',()=>{promptEvent=null;try{localStorage.setItem('kaginote.install-confirmed.v1','yes')}catch{}status.textContent='インストール完了。ホーム画面の「鍵ノート」アイコンから起動してください。';});
btn.addEventListener('click',async()=>{
 if(!promptEvent){instructions.scrollIntoView({behavior:'smooth',block:'center'});status.textContent='Chromeの「︙」メニューから「ホーム画面に追加」または「アプリをインストール」を選んでください。';return;}
 const e=promptEvent;promptEvent=null;
 try{await e.prompt();const c=await e.userChoice;status.textContent=c?.outcome==='accepted'?'インストール後、ホーム画面の鍵ノートから起動してください。':'ブラウザーのメニューから追加できます。';}catch{status.textContent='ブラウザーのメニューから追加してください。'}
});
openChrome.addEventListener('click',()=>{
 // Android intent routing may be blocked by in-app browsers; URL copy is a fallback.
 const intent='intent://arata3257a.github.io/cutting-calc/kaginote/install.html#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url='+encodeURIComponent(installUrl)+';end';
 status.textContent='Chromeが開かない場合は右上「︙」から「ブラウザで開く」を選んでください。';
 window.location.href=intent;
});
if('serviceWorker' in navigator&&location.protocol==='https:')window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js',{scope:'./'}).catch(()=>{}));
})();
