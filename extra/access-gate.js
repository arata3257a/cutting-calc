(()=>{
'use strict';
const ACCESS_KEY='extra-access-granted-v1';
function get(k){try{return localStorage.getItem(k)}catch{return null}}
const page=(location.pathname.split('/').pop()||'index.html').toLowerCase();
if(page==='access.html'||page==='complete.html'||page.startsWith('refresh-'))return;
if(get(ACCESS_KEY)!=='1'){
  location.replace('./access.html');
}
})();