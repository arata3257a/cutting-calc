(()=>{
'use strict';
const ACCESS_KEY='extra-access-granted-v1';
function get(k){try{return localStorage.getItem(k)}catch{return null}}
function standalone(){return window.matchMedia?.('(display-mode: standalone)').matches||navigator.standalone===true}
const page=(location.pathname.split('/').pop()||'index.html').toLowerCase();
if(page==='install.html'||page==='complete.html'||page.startsWith('refresh-'))return;
if(!standalone()){
  location.replace('./install.html');
  return;
}
if(get(ACCESS_KEY)!=='1')location.replace('./install.html');
})();