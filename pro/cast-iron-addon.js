(()=>{
  const data={
    castiron:{
      material:'FC250',
      tool:'OSG SI-WC-RESF 4枚刃',
      source:'基準工具・出典：OSG SI-WC-RESF',
      warning:'※ ap/aeはOSG公式条件表の上限値です。実加工では低い値から開始してください。乾式加工ではエアブローで切りくずを除去してください。',
      side:{6:[4770,610,9,1.8],8:[3580,940,12,2.4],10:[2860,950,15,3],12:[2390,860,18,3.6]},
      slot:{6:[3710,430,6,6],8:[2790,470,8,8],10:[2230,510,10,10],12:[1860,470,12,12]}
    },
    titanium:{
      material:'Ti-6Al-4V',
      tool:'OSG SI-WC-RESF 4枚刃',
      source:'基準工具・出典：OSG SI-WC-RESF',
      warning:'※ チタン合金は発熱しやすいため、被削材に適した切削油剤を使用し、切りくず排出を十分に確保してください。公式表にZ切込み条件はありません。',
      side:{6:[2650,180,9,1.8],8:[1990,270,12,2.4],10:[1590,270,15,3],12:[1330,250,18,3.6]},
      slot:{6:[2120,130,6,6],8:[1590,140,8,8],10:[1270,150,10,10],12:[1060,140,12,12]}
    }
  };
  const Z=4;
  [['castiron','鋳鉄'],['titanium','チタン']].forEach(([v,t])=>{const o=document.createElement('option');o.value=v;o.textContent=t;mode.appendChild(o)});
  const baseRender=window.render,baseShow=window.show;
  function renderExtra(){
    const d=data[mode.value];
    if(!d)return baseRender();
    material.innerHTML=`<option value="m">${d.material}</option>`;
    method.innerHTML='<option value="vertical" disabled>Z切込み（公式条件なし）</option><option value="slot">溝加工</option><option value="side">側面加工</option>';
    method.disabled=false;locWrap.style.display='none';
    dia.innerHTML=[6,8,10,12].map(x=>`<option value="${x}">φ${x}</option>`).join('');
    title.textContent=(mode.value==='titanium'?'チタン':'鋳鉄')+' 参考スタート条件';
    toolUsed.textContent='使用工具：'+d.tool;
    source.textContent=d.source;warning.textContent=d.warning;
    showExtra();
  }
  function showExtra(){
    const d=data[mode.value];
    if(!d)return baseShow();
    const D=+dia.value,r=(d[method.value]||{})[D];
    if(!r){clearResult();return}
    const[N,F,AP,AE]=r;
    n.textContent=N.toLocaleString();f.textContent=F.toLocaleString();ap.textContent=AP;ae.textContent=AE;
    vc.textContent=(Math.PI*D*N/1000).toFixed(1);fz.textContent=(F/(N*Z)).toFixed(3);
  }
  window.render=renderExtra;window.show=showExtra;
  mode.onchange=renderExtra;
  dia.onchange=()=>data[mode.value]?showExtra():(mode.value==='hgs'?locs():baseShow());
  material.onchange=()=>data[mode.value]?showExtra():baseShow();
  method.onchange=()=>data[mode.value]?showExtra():baseShow();
})();