(()=>{
  const materialLabels={
    carbon:'炭素鋼',
    alloy:'合金鋼',
    sus:'ステンレス',
    al:'アルミ',
    dlces:'銅',
    resin:'樹脂',
    castiron:'鋳鉄',
    hgs:'高硬度材',
    cwlb:'ボール加工（材質は次で選択）'
  };
  const toolLabels={
    carbon:'UNION TOOL CZS 4枚刃',
    alloy:'UNION TOOL CZS 4枚刃',
    sus:'UNION TOOL CZS 4枚刃',
    al:'UNION TOOL DLC-ALES 3枚刃',
    dlces:'UNION TOOL DLCES4000 4枚刃',
    resin:'NS TOOL RSES230 2枚刃',
    castiron:'OSG SI-WC-RESF 4枚刃',
    hgs:'UNION TOOL HGS 6枚刃',
    cwlb:'UNION TOOL CWLB 2枚刃 ボールエンドミル'
  };

  function ensureToolDisplay(){
    if(document.getElementById('toolUsed')) return;
    const el=document.createElement('div');
    el.id='toolUsed';
    el.className='note';
    el.style.margin='6px 0 12px';
    el.style.color='#dceaff';
    title.insertAdjacentElement('afterend',el);
  }

  function relabel(){
    const labels=[...document.querySelectorAll('label')];
    const first=labels.find(x=>x.textContent.includes('工具・用途'));
    if(first) first.textContent='① 材質';
    const steps=[...document.querySelectorAll('.step')];
    if(steps[0]) steps[0].textContent='1 材質';
    [...mode.options].forEach(o=>{if(materialLabels[o.value])o.textContent=materialLabels[o.value];});
    ensureToolDisplay();
    const tool=toolLabels[mode.value]||'—';
    document.getElementById('toolUsed').textContent='使用工具：'+tool;
  }

  const prevModeChange=mode.onchange;
  mode.onchange=function(e){
    if(prevModeChange) prevModeChange.call(this,e);
    setTimeout(relabel,0);
  };

  const prevMaterialChange=material.onchange;
  material.onchange=function(e){
    if(prevMaterialChange) prevMaterialChange.call(this,e);
    setTimeout(relabel,0);
  };

  setTimeout(relabel,0);
})();
