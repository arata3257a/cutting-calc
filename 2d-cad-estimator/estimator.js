const ESTIMATOR_SETTINGS_KEY="easy-2d-cad-estimator-settings-v1";
const EST_TAP_DRILLS={M3:2.5,M4:3.3,M5:4.2,M6:5.0,M8:6.8,M10:8.5,M12:10.2};
const EST_SETTING_IDS=[
  "estHourlyRate","estThickness","estRefThickness","estSetupMin",
  "estHoleMin","estTapMin","estOuterSpeed","estGrooveSpeed","estHoleMaxD","estTapTolerance"
];
const EST_VALUE_IDS=["estHoleCount","estTapCount","estOuterLength","estGrooveLength"];

function estNum(id,fallback=0){
  const v=Number(qs(id)?.value);
  return Number.isFinite(v)?v:fallback;
}
function loadEstimatorSettings(){
  const defaults={estHourlyRate:6000,estThickness:10,estRefThickness:10,estSetupMin:15,estHoleMin:.6,estTapMin:1.5,estOuterSpeed:120,estGrooveSpeed:100,estHoleMaxD:30,estTapTolerance:.12};
  let saved={};
  try{saved=JSON.parse(localStorage.getItem(ESTIMATOR_SETTINGS_KEY))||{}}catch{}
  for(const id of EST_SETTING_IDS) if(qs(id)) qs(id).value=(id in saved?saved[id]:defaults[id]);
}
function saveEstimatorSettings(){
  const data={};
  for(const id of EST_SETTING_IDS) data[id]=estNum(id);
  localStorage.setItem(ESTIMATOR_SETTINGS_KEY,JSON.stringify(data));
  hint.textContent="見積設定を保存しました";
  calculateEstimate();
}
function estRectPerimeter(s){
  const r=rectNorm(s);
  let p=2*(Math.abs(r.w)+Math.abs(r.h));
  const limit=Math.min(Math.abs(r.w),Math.abs(r.h))/2;
  for(const key of ["tl","tr","br","bl"]){
    const mod=s.corners?.[key],v=Math.min(Math.max(0,Number(mod?.value)||0),limit);
    if(!mod||v<=EPS) continue;
    if(mod.type==="chamfer") p-=v*(2-Math.SQRT2);
    else p-=v*(2-Math.PI/2);
  }
  return Math.max(0,p);
}
function estSlotPerimeter(s){
  const total=Math.max(Math.abs(Number(s.length)||0),Math.abs(Number(s.width)||0));
  const width=Math.min(Math.abs(Number(s.length)||0),Math.abs(Number(s.width)||0));
  return Math.max(0,2*(total-width)+Math.PI*width);
}
function estArcEdge(s){
  const r=Math.abs(Number(s.r)||0),a1=Number(s.a1)||0,a2=Number(s.a2)||0;
  return {
    p1:{x:s.cx+r*Math.cos(rad(a1)),y:s.cy+r*Math.sin(rad(a1))},
    p2:{x:s.cx+r*Math.cos(rad(a2)),y:s.cy+r*Math.sin(rad(a2))},
    length:r*rad(ccwSpan(a1,a2))
  };
}
function estNetwork(edges,tol=.05){
  if(!edges.length)return{closedLengths:[],openLength:0};
  const key=p=>Math.round(p.x/tol)+","+Math.round(p.y/tol),nodeEdges=new Map();
  edges.forEach((e,i)=>{
    e.k1=key(e.p1);e.k2=key(e.p2);
    for(const k of [e.k1,e.k2]){
      if(!nodeEdges.has(k))nodeEdges.set(k,[]);
      nodeEdges.get(k).push(i);
    }
  });
  const seen=new Set(),closedLengths=[];let openLength=0;
  for(let i=0;i<edges.length;i++){
    if(seen.has(i))continue;
    const stack=[i],comp=[],nodes=new Set();
    while(stack.length){
      const ei=stack.pop();
      if(seen.has(ei))continue;
      seen.add(ei);comp.push(ei);
      const e=edges[ei];nodes.add(e.k1);nodes.add(e.k2);
      for(const k of [e.k1,e.k2])for(const ni of nodeEdges.get(k)||[])if(!seen.has(ni))stack.push(ni);
    }
    const compSet=new Set(comp);
    const len=comp.reduce((sum,ei)=>sum+Math.max(0,Number(edges[ei].length)||0),0);
    const closed=comp.length>=2&&[...nodes].every(k=>(nodeEdges.get(k)||[]).filter(ei=>compSet.has(ei)).length===2);
    if(closed)closedLengths.push(len);else openLength+=len;
  }
  return{closedLengths,openLength};
}
function estTapMatch(d,tolerance){
  let best=null,bestDiff=Infinity;
  for(const [name,drill] of Object.entries(EST_TAP_DRILLS)){
    const diff=Math.abs(d-drill);
    if(diff<=tolerance&&diff<bestDiff){best=name;bestDiff=diff}
  }
  return best;
}
function scanDrawingForEstimate(){
  const holeMaxD=Math.max(.1,estNum("estHoleMaxD",30));
  const tapTolerance=Math.max(0,estNum("estTapTolerance",.12));
  const visible=shapes.filter(isShapeVisible);
  let holeCount=0,tapCount=0,grooveLength=0;
  const tapBreakdown={},closedLoops=[],networkEdges=[],genericCircleGroups=new Map();
  const centerTol=.05,centerKey=s=>Math.round(s.cx/centerTol)+","+Math.round(s.cy/centerTol);

  for(const s of visible){
    if(s.type==="hole"){
      const kind=String(s.holeKind||"through");
      if(kind!=="through"&&kind!=="counterbore"&&kind!=="countersink"){
        tapCount++;tapBreakdown[kind]=(tapBreakdown[kind]||0)+1;
      }else holeCount++;
      continue;
    }
    if(s.type==="circle"){
      const k=centerKey(s);
      if(!genericCircleGroups.has(k))genericCircleGroups.set(k,[]);
      genericCircleGroups.get(k).push(s);
      continue;
    }
    if(s.type==="rect"){closedLoops.push(estRectPerimeter(s));continue}
    if(s.type==="slot"){grooveLength+=estSlotPerimeter(s);continue}
    if(s.type==="line"){
      networkEdges.push({p1:{x:Number(s.x1)||0,y:Number(s.y1)||0},p2:{x:Number(s.x2)||0,y:Number(s.y2)||0},length:Math.hypot((Number(s.x2)||0)-(Number(s.x1)||0),(Number(s.y2)||0)-(Number(s.y1)||0))});
      continue;
    }
    if(s.type==="arc"){networkEdges.push(estArcEdge(s));continue}
  }

  for(const group of genericCircleGroups.values()){
    const ds=group.map(s=>Math.abs(Number(s.r)||0)*2).sort((a,b)=>a-b),minD=ds[0]||0;
    if(minD<=holeMaxD){
      const tap=estTapMatch(minD,tapTolerance);
      if(tap){tapCount++;tapBreakdown[tap]=(tapBreakdown[tap]||0)+1}else holeCount++;
    }else for(const d of ds)closedLoops.push(Math.PI*d);
  }

  const net=estNetwork(networkEdges);
  closedLoops.push(...net.closedLengths.filter(v=>v>EPS));
  grooveLength+=net.openLength;
  closedLoops.sort((a,b)=>b-a);
  const outerLength=closedLoops.length?closedLoops[0]:0;
  if(closedLoops.length>1)grooveLength+=closedLoops.slice(1).reduce((a,b)=>a+b,0);

  qs("estHoleCount").value=String(holeCount);
  qs("estTapCount").value=String(tapCount);
  qs("estOuterLength").value=round(outerLength,1);
  qs("estGrooveLength").value=round(grooveLength,1);
  const taps=Object.entries(tapBreakdown).map(([k,v])=>k+"×"+v).join(" / ");
  qs("estimateDetectNote").textContent="表示中の図形を自動集計。"+(taps?" タップ候補: "+taps+"。":"")+" 数値は手動修正できます。";
  calculateEstimate();
}
function calculateEstimate(){
  const hourly=Math.max(0,estNum("estHourlyRate")),thickness=Math.max(.01,estNum("estThickness",10)),ref=Math.max(.01,estNum("estRefThickness",10));
  const factor=thickness/ref,setup=Math.max(0,estNum("estSetupMin")),holes=Math.max(0,estNum("estHoleCount")),taps=Math.max(0,estNum("estTapCount"));
  const outer=Math.max(0,estNum("estOuterLength")),groove=Math.max(0,estNum("estGrooveLength"));
  const holeTime=holes*Math.max(0,estNum("estHoleMin"))*factor;
  const tapTime=taps*Math.max(0,estNum("estTapMin"))*factor;
  const outerTime=outer/Math.max(.01,estNum("estOuterSpeed",1))*factor;
  const grooveTime=groove/Math.max(.01,estNum("estGrooveSpeed",1))*factor;
  const total=setup+holeTime+tapTime+outerTime+grooveTime,cost=Math.round(total/60*hourly);
  qs("estThicknessFactor").textContent="×"+factor.toFixed(2);
  qs("estHoleTime").textContent=holeTime.toFixed(1)+"分";
  qs("estTapTime").textContent=tapTime.toFixed(1)+"分";
  qs("estOuterTime").textContent=outerTime.toFixed(1)+"分";
  qs("estGrooveTime").textContent=grooveTime.toFixed(1)+"分";
  qs("estSetupTime").textContent=setup.toFixed(1)+"分";
  qs("estTotalTime").textContent=total.toFixed(1)+"分";
  qs("estCost").textContent="¥"+cost.toLocaleString("ja-JP");
}
function closeEstimatePanel(){
  qs("estimatePanel")?.classList.add("hidden");
  qs("estimateBtn")?.classList.remove("active");
}
function openEstimatePanel(){
  qs("layerPanel")?.classList.add("hidden");
  closeProperty();
  quickPanel?.classList.add("hidden");
  qs("estimatePanel")?.classList.remove("hidden");
  qs("estimateBtn")?.classList.add("active");
  scanDrawingForEstimate();
  enableDirectNumberEntry(qs("estimatePanel"));
}
qs("estimateBtn")?.addEventListener("click",()=>{
  const open=!qs("estimatePanel")?.classList.contains("hidden");
  if(open)closeEstimatePanel();else openEstimatePanel();
});
qs("closeEstimateBtn")?.addEventListener("click",closeEstimatePanel);
qs("scanEstimateBtn")?.addEventListener("click",scanDrawingForEstimate);
qs("saveEstimateSettingsBtn")?.addEventListener("click",saveEstimatorSettings);
for(const id of [...EST_SETTING_IDS,...EST_VALUE_IDS])qs(id)?.addEventListener("input",calculateEstimate);
document.querySelectorAll(".tool[data-tool]").forEach(btn=>btn.addEventListener("click",closeEstimatePanel));
qs("layerBtn")?.addEventListener("click",closeEstimatePanel);
qs("sheetBtn")?.addEventListener("click",closeEstimatePanel);
loadEstimatorSettings();
calculateEstimate();
