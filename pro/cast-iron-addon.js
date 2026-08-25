(()=>{
  const castRows={side:{6:[4770,610,9,1.8],8:[3580,940,12,2.4],10:[2860,950,15,3],12:[2390,860,18,3.6]},slot:{6:[3710,430,6,6],8:[2790,470,8,8],10:[2230,510,10,10],12:[1860,470,12,12]}};
  const titaniumRows={
    side:{6:[2650,180,9,1.8],8:[1990,270,12,2.4],10:[1590,270,12,3],12:[1330,290,12,3.6]},
    slot:{6:[2120,130,6,6],8:[1590,140,8,8],10:[1270,150,10,10],12:[1060,140,12,12]}
  };
  const Z=4;

  function addOption(value,text){
    if([...mode.options].some(o=>o.value===value))return;
    const option=document.createElement('option');
    option.value=value;option.textContent=text;mode.appendChild(option);
  }
  addOption('castiron','鋳鉄');
  addOption('titanium','チタン');

  const baseRender=window.render,baseShow=window.show;

  function setCommon(materialHtml,tool,titleText,sourceText,warningText){
    material.innerHTML=materialHtml;
    method.innerHTML='<option value="vertical" disabled>Z切込み（公式条件なし）</option><option value="slot">溝加工</option><option value="side">側面加工</option>';
    method.disabled=false;
    locWrap.style.display='none';
    dia.innerHTML=[6,8,10,12].map(d=>`<option value="${d}">φ${d}</option>`).join('');
    title.textContent=titleText;
    if(window.toolUsed)toolUsed.textContent='使用工具：'+tool;
    source.textContent=sourceText;
    warning.textContent=warningText;
  }

  function renderExtra(){
    if(mode.value==='castiron'){
      setCommon('<option value="fc250">FC250</option>','OSG SI-WC-RESF 4枚刃','鋳鉄 参考スタート条件','基準工具・出典：OSG SI-WC-RESF','※ ap/aeはOSG公式条件表の上限値です。実加工では低い値から開始してください。乾式加工ではエアブローで切りくずを除去してください。');
      showExtra();return;
    }
    if(mode.value==='titanium'){
      setCommon('<option value="ti64">Ti-6Al-4V</option>','OSG SI-WC-RESF 4枚刃','チタン 参考スタート条件','基準工具・出典：OSG SI-WC-RESF','※ Ti-6Al-4Vのメーカー公開条件。Z切込みは公式条件なし。切削油剤を使用し、発熱に注意して調整してください。');
      showExtra();return;
    }
    return baseRender();
  }

  function showExtra(){
    let rows=null;
    if(mode.value==='castiron')rows=castRows;
    else if(mode.value==='titanium')rows=titaniumRows;
    else return baseShow();
    const D=+dia.value,r=(rows[method.value]||{})[D];
    if(!r){clearResult();return;}
    const[N,F,AP,AE]=r;
    n.textContent=N.toLocaleString();
    f.textContent=F.toLocaleString();
    ap.textContent=AP;
    ae.textContent=AE;
    vc.textContent=(Math.PI*D*N/1000).toFixed(1);
    fz.textContent=(F/(N*Z)).toFixed(3);
  }

  window.render=renderExtra;window.show=showExtra;
  mode.onchange=renderExtra;
  dia.onchange=()=>['castiron','titanium'].includes(mode.value)?showExtra():(mode.value==='hgs'?locs():baseShow());
  material.onchange=()=>['castiron','titanium'].includes(mode.value)?showExtra():baseShow();
  method.onchange=()=>['castiron','titanium'].includes(mode.value)?showExtra():baseShow();
})();