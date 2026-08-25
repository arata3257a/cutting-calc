(()=>{
  const castRows={side:{6:[4770,610,9,1.8],8:[3580,940,12,2.4],10:[2860,950,15,3],12:[2390,860,18,3.6]},slot:{6:[3710,430,6,6],8:[2790,470,8,8],10:[2230,510,10,10],12:[1860,470,12,12]}};
  const titaniumRows={
    side:{6:[2650,180,9,1.8],8:[1990,270,12,2.4],10:[1590,270,12,3],12:[1330,290,12,3.6]},
    slot:{6:[2120,130,6,6],8:[1590,140,8,8],10:[1270,150,10,10],12:[1060,140,12,12]}
  };
  const tungstenRows={
    side:{3:[9000,700,2.25,.3],4:[7200,770,3,.4],6:[5000,880,4.5,.6],8:[3800,820,6,.8],10:[3200,820,7.5,1]}
  };
  const Z=4;

  function addOption(value,text){
    if([...mode.options].some(o=>o.value===value))return;
    const option=document.createElement('option');
    option.value=value;option.textContent=text;mode.appendChild(option);
  }
  addOption('castiron','鋳鉄');
  addOption('titanium','チタン');
  addOption('tungsten','タングステン');

  const baseRender=window.render,baseShow=window.show;

  function setCommon({materialHtml,tool,titleText,sourceText,warningText,dias,methods}){
    material.innerHTML=materialHtml;
    method.innerHTML=methods;
    method.disabled=false;
    locWrap.style.display='none';
    dia.innerHTML=dias.map(d=>`<option value="${d}">φ${d}</option>`).join('');
    title.textContent=titleText;
    if(window.toolUsed)toolUsed.textContent='使用工具：'+tool;
    source.textContent=sourceText;
    warning.textContent=warningText;
  }

  const standardMethods='<option value="vertical" disabled>Z切込み（公式条件なし）</option><option value="slot">溝加工</option><option value="side">側面加工</option>';
  const sideOnlyMethods='<option value="vertical" disabled>Z切込み（公式条件なし）</option><option value="slot" disabled>溝加工（公式条件なし）</option><option value="side">側面加工</option>';

  function renderExtra(){
    if(mode.value==='castiron'){
      setCommon({materialHtml:'<option value="fc250">FC250</option>',tool:'OSG SI-WC-RESF 4枚刃',titleText:'鋳鉄 参考スタート条件',sourceText:'基準工具・出典：OSG SI-WC-RESF',warningText:'※ ap/aeはOSG公式条件表の上限値です。実加工では低い値から開始してください。乾式加工ではエアブローで切りくずを除去してください。',dias:[6,8,10,12],methods:standardMethods});
      showExtra();return;
    }
    if(mode.value==='titanium'){
      setCommon({materialHtml:'<option value="ti64">Ti-6Al-4V</option>',tool:'OSG SI-WC-RESF 4枚刃',titleText:'チタン 参考スタート条件',sourceText:'基準工具・出典：OSG SI-WC-RESF',warningText:'※ Ti-6Al-4Vのメーカー公開条件。Z切込みは公式条件なし。切削油剤を使用し、発熱に注意して調整してください。',dias:[6,8,10,12],methods:standardMethods});
      showExtra();return;
    }
    if(mode.value==='tungsten'){
      setCommon({materialHtml:'<option value="w70cu30">銅タングステン（W70%-Cu30%）</option>',tool:'UNION TOOL DLCES4000 4枚刃',titleText:'タングステン 参考スタート条件',sourceText:'基準工具・出典：UNION TOOL DLCES4000',warningText:'※ 現在登録しているのは純タングステンではなく、銅タングステン W70%-Cu30% の公式条件です。Z切込み・溝加工は公式条件なし。',dias:[3,4,6,8,10],methods:sideOnlyMethods});
      showExtra();return;
    }
    return baseRender();
  }

  function showExtra(){
    let rows=null;
    if(mode.value==='castiron')rows=castRows;
    else if(mode.value==='titanium')rows=titaniumRows;
    else if(mode.value==='tungsten')rows=tungstenRows;
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
  dia.onchange=()=>['castiron','titanium','tungsten'].includes(mode.value)?showExtra():(mode.value==='hgs'?locs():baseShow());
  material.onchange=()=>['castiron','titanium','tungsten'].includes(mode.value)?showExtra():baseShow();
  method.onchange=()=>['castiron','titanium','tungsten'].includes(mode.value)?showExtra():baseShow();
})();