(()=>{
  const PASSWORD='1121';
  const KEY='vacuum_heater_unlocked';

  function unlock(){
    sessionStorage.setItem(KEY,'1');
    const gate=document.getElementById('passwordGate');
    if(gate) gate.remove();
    document.documentElement.classList.remove('app-locked');
  }

  function showGate(){
    if(sessionStorage.getItem(KEY)==='1') return;
    document.documentElement.classList.add('app-locked');
    const gate=document.createElement('div');
    gate.id='passwordGate';
    gate.innerHTML=`<div class="password-card"><h2>真空成形 ヒーター熱分布</h2><p>パスワードを入力してください</p><input id="downloadPassword" type="password" inputmode="numeric" maxlength="4" autocomplete="off" placeholder="4桁"><button id="passwordSubmit">開く</button><div id="passwordError"></div></div>`;
    document.body.appendChild(gate);
    const input=document.getElementById('downloadPassword');
    const submit=()=>{
      if(input.value===PASSWORD){ unlock(); }
      else { document.getElementById('passwordError').textContent='パスワードが違います'; input.value=''; input.focus(); }
    };
    document.getElementById('passwordSubmit').onclick=submit;
    input.addEventListener('keydown',e=>{if(e.key==='Enter') submit();});
    input.focus();
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',showGate);
  else showGate();
})();
