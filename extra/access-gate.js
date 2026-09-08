(()=>{
'use strict';
const ACCESS_KEY='extra-access-granted-v1';
function get(k){try{return localStorage.getItem(k)}catch{return null}}
function standalone(){return window.matchMedia?.('(display-mode: standalone)').matches||navigator.standalone===true}
const page=(location.pathname.split('/').pop()||'index.html').toLowerCase();
if(page==='install.html'||page==='complete.html'||page.startsWith('refresh-'))return;
const params=new URLSearchParams(location.search);
const browserOpen=params.get('open')==='1';
const granted=get(ACCESS_KEY)==='1';
if(!standalone()){
  if(browserOpen&&granted)return;
  location.replace('./install.html');
  return;
}
if(!granted)location.replace('./install.html');
})();