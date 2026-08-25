(()=>{
  const rows={
    side:{6:[4770,610,9,1.8],8:[3580,940,12,2.4],10:[2860,950,15,3],12:[2390,860,18,3.6]},
    slot:{6:[3710,430,6,6],8:[2790,470,8,8],10:[2230,510,10,10],12:[1860,470,12,12]}
  };
  const Z=4;
  const option=document.createElement('option');
  option.value='castiron';
  option.textContent='SI-WC-RESF 4枚刃 / 鋳鉄 FC250';
  mode.appendChild(option);

  const baseRender=window.render;
  const baseShow=window.show;

  function renderCast(){
    if(mode.value!=='castiron') return baseRender();
    material.innerHTML='<option value="fc250">FC250（鋳鉄）</option>';
    method.innerHTML='<option value="side">側面加工</option><option value="slot">溝加工</option>';
    method.disabled=false;
    locWrap.style.display='none';
    dia.innerHTML=[6,8,10,12].map(d=>`<option value="${d}">φ${d}</option>`).join('');
    title.textContent='SI-WC-RESF 4枚刃・FC250 参考スタート条件';
    source.textContent='基準工具・出典：OSG SI-WC-RESF';
    warning.textContent='※ ap/aeはOSG公式条件表の上限値です。実加工では機械・保持剛性に合わせて低い値から開始してください。乾式加工ではエアブローで切りくずを除去してください。';
    showCast();
  }

  function showCast(){
    if(mode.value!=='castiron') return baseShow();
    const D=+dia.value;
    const r=(rows[method.value]||{})[D];
    if(!r){clearResult();return;}
    const [N,F,AP,AE]=r;
    n.textContent=N.toLocaleString();
    f.textContent=F.toLocaleString();
    ap.textContent=AP;
    ae.textContent=AE;
    vc.textContent=(Math.PI*D*N/1000).toFixed(1);
    fz.textContent=(F/(N*Z)).toFixed(3);
  }

  window.render=renderCast;
  window.show=showCast;
  mode.onchange=renderCast;
  dia.onchange=()=>mode.value==='castiron'?showCast():(mode.value==='hgs'?locs():mode.value==='cwlb'?cwlbLocs():baseShow());
  material.onchange=()=>mode.value==='castiron'?showCast():baseShow();
  method.onchange=()=>mode.value==='castiron'?showCast():baseShow();
})();
