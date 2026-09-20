const ESTIMATOR_SETTINGS_KEY="easy-2d-cad-estimator-settings-v1";
const EST_TAP_DRILLS={M3:2.5,M4:3.3,M5:4.2,M6:5.0,M8:6.8,M10:8.5,M12:10.2};
const EST_SETTING_IDS=[
  "estHourlyRate","estThickness","estCutDepth","estSetupMin",
  "estHoleMin","estTapMin","estOuterSpeed","estGrooveSpeed","estHoleMaxD","estTapTolerance"
];
const EST_VALUE_IDS=["estHoleCount","estTapCount","estOuterLength","estGrooveLength"];

function estNum(id,fallback=0){
  const v=Number(qs(id)?.value);
  return Number.isFinite(v)?v:fallback;
}
function loadEstimatorSettings(){
  const defaults={estHourlyRate:6000,estThickness:10,estCutDepth:5,estSetupMin:15,estHoleMin:.6,estTapMin:1.5,estOuterSpeed:120,estGrooveSpeed:100,estHoleMaxD:30,estTapTolerance:.12};
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
function estShapeLength(s){
  if(s.type==="line") return Math.hypot((Number(s.x2)||0)-(Number(s.x1)||0),(Number(s.y2)||0)-(Number(s.y1)||0));
  if(s.type==="arc") return estArcEdge(s).length;
  if(s.type==="rect") return estRectPerimeter(s);
  if(s.type==="slot") return estSlotPerimeter(s);
  if(s.type==="circle") return Math.PI*Math.abs(Number(s.r)||0)*2;
  return 0;
}

function estShapeEndpoints(s){
  if(s.type==="line") return [
    {x:Number(s.x1)||0,y:Number(s.y1)||0},
    {x:Number(s.x2)||0,y:Number(s.y2)||0}
  ];
  if(s.type==="arc"){
    const a=estArcEdge(s);
    return [a.p1,a.p2];
  }
  return [];
}

function estConnectedShapeIds(seedIds,tol=.05){
  const lineShapes=shapes.filter(s=>isShapeVisible(s)&&["line","arc"].includes(s.type));
  const byId=new Map(lineShapes.map(s=>[s.id,s]));
  const selected=new Set([...seedIds].filter(id=>byId.has(id)));
  if(!selected.size) return selected;
  const near=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y)<=tol;
  const queue=[...selected];
  while(queue.length){
    const id=queue.shift(),base=byId.get(id);
    if(!base)continue;
    const ep=estShapeEndpoints(base);
    for(const other of lineShapes){
      if(selected.has(other.id))continue;
      const op=estShapeEndpoints(other);
      if(ep.some(a=>op.some(b=>near(a,b)))){
        selected.add(other.id);
        queue.push(other.id);
      }
    }
  }
  return selected;
}

function estimatorSelectedIds(){
  const ids=new Set(selectedIds||[]);
  if(selectedId!==null&&selectedId!==undefined) ids.add(selectedId);
  return ids;
}

function updateEstimateSelectionNote(){
  const note=qs("estimateSelectionNote");
  if(!note)return;
  const ids=estimatorSelectedIds();
  if(!ids.size){
    note.textContent="図形を選択して、外形加工か溝加工かを指定します。線・円弧は、つながった輪郭をまとめて指定します。";
    return;
  }
  const targets=shapes.filter(s=>ids.has(s.id));
  const kinds=new Set(targets.map(s=>s.estimateKind||"auto"));
  const label=kinds.size===1?(kinds.has("outer")?"外形":kinds.has("groove")?"溝":"未指定"):"混在";
  note.textContent="選択中: "+targets.length+"要素 / 現在の指定: "+label;
}

function markEstimateKind(kind){
  const ids=estimatorSelectedIds();
  if(!ids.size){
    hint.textContent="先に図形を選択してください";
    updateEstimateSelectionNote();
    return;
  }
  const connected=estConnectedShapeIds(ids);
  const targetIds=connected.size?new Set([...ids,...connected]):ids;
  let count=0;
  for(const s of shapes){
    if(!targetIds.has(s.id))continue;
    if(!["line","arc","rect","circle","slot"].includes(s.type))continue;
    if(kind){
      s.estimateKind=kind;
      delete s.estimateHoleKind;
    }else delete s.estimateKind;
    count++;
  }
  if(!count){
    hint.textContent="外形・溝として指定できる図形を選択してください";
    return;
  }
  snapshot();
  draw();
  updateEstimateSelectionNote();
  scanDrawingForEstimate();
  hint.textContent=kind==="outer"?"外形加工に指定しました":kind==="groove"?"溝加工に指定しました":"加工指定を解除しました";
}


function estSameCenterHoleIds(seedIds,tol=.05){
  const result=new Set();
  const seeds=shapes.filter(s=>seedIds.has(s.id)&&["circle","hole"].includes(s.type));
  for(const seed of seeds){
    result.add(seed.id);
    const sx=Number(seed.cx)||0,sy=Number(seed.cy)||0;
    for(const s of shapes){
      if(!["circle","hole"].includes(s.type))continue;
      const dx=(Number(s.cx)||0)-sx,dy=(Number(s.cy)||0)-sy;
      if(Math.hypot(dx,dy)<=tol) result.add(s.id);
    }
  }
  return result;
}

function updateEstimateHoleSelectionNote(){
  const note=qs("estimateHoleSelectionNote");
  if(!note)return;
  const ids=estimatorSelectedIds();
  const targets=shapes.filter(s=>ids.has(s.id)&&["circle","hole"].includes(s.type));
  if(!targets.length){
    note.textContent="円・穴を選択して、普通の穴かネジ穴かを指定します。同じ中心の円はまとめて扱います。";
    return;
  }
  const kinds=new Set(targets.map(s=>s.estimateHoleKind||"auto"));
  const label=kinds.size===1?(kinds.has("hole")?"穴":kinds.has("tap")?"ネジ穴":"未指定"):"混在";
  note.textContent="選択中: "+targets.length+"要素 / 現在の指定: "+label;
}

function markEstimateHoleKind(kind){
  const ids=estimatorSelectedIds();
  if(!ids.size){
    hint.textContent="先に円または穴を選択してください";
    updateEstimateHoleSelectionNote();
    return;
  }
  const targetIds=estSameCenterHoleIds(ids);
  let count=0;
  for(const s of shapes){
    if(!targetIds.has(s.id))continue;
    if(!["circle","hole"].includes(s.type))continue;
    if(kind){
      s.estimateHoleKind=kind;
      delete s.estimateKind;
    }else{
      delete s.estimateHoleKind;
    }
    count++;
  }
  if(!count){
    hint.textContent="穴として指定できる円・穴を選択してください";
    return;
  }
  snapshot();
  draw();
  updateEstimateHoleSelectionNote();
  scanDrawingForEstimate();
  hint.textContent=kind==="hole"?"普通の穴に指定しました":kind==="tap"?"ネジ穴に指定しました":"穴指定を解除しました";
}

function scanDrawingForEstimate(){
  const holeMaxD=Math.max(.1,estNum("estHoleMaxD",30));
  const tapTolerance=Math.max(0,estNum("estTapTolerance",.12));
  const visible=shapes.filter(isShapeVisible);
  let holeCount=0,tapCount=0,manualOuterLength=0,manualGrooveLength=0,autoGrooveLength=0;
  const tapBreakdown={},autoClosedLoops=[],autoNetworkEdges=[],genericCircleGroups=new Map();
  const centerTol=.05,centerKey=s=>Math.round(s.cx/centerTol)+","+Math.round(s.cy/centerTol);

  for(const s of visible){
    if(s.type==="hole"){
      if(s.estimateHoleKind==="tap"){
        tapCount++;tapBreakdown["指定ネジ穴"]=(tapBreakdown["指定ネジ穴"]||0)+1;
        continue;
      }
      if(s.estimateHoleKind==="hole"){
        holeCount++;
        continue;
      }
      const kind=String(s.holeKind||"through");
      if(kind!=="through"&&kind!=="counterbore"&&kind!=="countersink"){
        tapCount++;tapBreakdown[kind]=(tapBreakdown[kind]||0)+1;
      }else holeCount++;
      continue;
    }

    if(s.estimateKind==="outer"){
      manualOuterLength+=estShapeLength(s);
      continue;
    }
    if(s.estimateKind==="groove"){
      manualGrooveLength+=estShapeLength(s);
      continue;
    }

    if(s.type==="circle"){
      const k=centerKey(s);
      if(!genericCircleGroups.has(k))genericCircleGroups.set(k,[]);
      genericCircleGroups.get(k).push(s);
      continue;
    }
    if(s.type==="rect"){autoClosedLoops.push(estRectPerimeter(s));continue}
    if(s.type==="slot"){autoGrooveLength+=estSlotPerimeter(s);continue}
    if(s.type==="line"){
      autoNetworkEdges.push({
        p1:{x:Number(s.x1)||0,y:Number(s.y1)||0},
        p2:{x:Number(s.x2)||0,y:Number(s.y2)||0},
        length:estShapeLength(s)
      });
      continue;
    }
    if(s.type==="arc"){autoNetworkEdges.push(estArcEdge(s));continue}
  }

  for(const group of genericCircleGroups.values()){
    const manualHoleKind=group.map(s=>s.estimateHoleKind).find(v=>v==="hole"||v==="tap");
    if(manualHoleKind==="hole"){
      holeCount++;
      continue;
    }
    if(manualHoleKind==="tap"){
      tapCount++;
      tapBreakdown["指定ネジ穴"]=(tapBreakdown["指定ネジ穴"]||0)+1;
      continue;
    }
    const ds=group.map(s=>Math.abs(Number(s.r)||0)*2).sort((a,b)=>a-b),minD=ds[0]||0;
    if(minD<=holeMaxD){
      const tap=estTapMatch(minD,tapTolerance);
      if(tap){tapCount++;tapBreakdown[tap]=(tapBreakdown[tap]||0)+1}else holeCount++;
    }else{
      for(const d of ds)autoClosedLoops.push(Math.PI*d);
    }
  }

  const net=estNetwork(autoNetworkEdges);
  autoClosedLoops.push(...net.closedLengths.filter(v=>v>EPS));
  autoGrooveLength+=net.openLength;
  autoClosedLoops.sort((a,b)=>b-a);

  const autoOuterLength=autoClosedLoops.length?autoClosedLoops[0]:0;
  if(autoClosedLoops.length>1) autoGrooveLength+=autoClosedLoops.slice(1).reduce((a,b)=>a+b,0);

  const outerLength=manualOuterLength+autoOuterLength;
  const grooveLength=manualGrooveLength+autoGrooveLength;

  qs("estHoleCount").value=String(holeCount);
  qs("estTapCount").value=String(tapCount);
  qs("estOuterLength").value=round(outerLength,1);
  qs("estGrooveLength").value=round(grooveLength,1);

  const taps=Object.entries(tapBreakdown).map(([k,v])=>k+"×"+v).join(" / ");
  const manualCount=visible.filter(s=>s.estimateKind==="outer"||s.estimateKind==="groove"||s.estimateHoleKind==="hole"||s.estimateHoleKind==="tap").length;
  qs("estimateDetectNote").textContent=
    "指定済み "+manualCount+"要素を優先。未指定のみ自動判定。"+
    (taps?" タップ候補: "+taps+"。":"")+
    " 数値は手動修正できます。";
  updateEstimateSelectionNote();
  updateEstimateHoleSelectionNote();
  calculateEstimate();
}
function calculateEstimate(){
  const hourly=Math.max(0,estNum("estHourlyRate"));
  const thickness=Math.max(.01,estNum("estThickness",10));
  const cutDepth=Math.max(0,estNum("estCutDepth",5));
  const thicknessFactor=thickness/10;
  const cutDepthFactor=cutDepth/10;
  const setup=Math.max(0,estNum("estSetupMin"));
  const holes=Math.max(0,estNum("estHoleCount"));
  const taps=Math.max(0,estNum("estTapCount"));
  const outer=Math.max(0,estNum("estOuterLength"));
  const groove=Math.max(0,estNum("estGrooveLength"));

  // 穴・ネジ穴・外形は素材厚み、溝は実際の掘込み深さで補正する。
  const holeTime=holes*Math.max(0,estNum("estHoleMin"))*thicknessFactor;
  const tapTime=taps*Math.max(0,estNum("estTapMin"))*thicknessFactor;
  const outerTime=outer/Math.max(.01,estNum("estOuterSpeed",1))*thicknessFactor;
  const grooveTime=groove/Math.max(.01,estNum("estGrooveSpeed",1))*cutDepthFactor;
  const total=setup+holeTime+tapTime+outerTime+grooveTime;
  const cost=Math.round(total/60*hourly);

  qs("estThicknessFactor").textContent="×"+thicknessFactor.toFixed(2);
  qs("estCutDepthFactor").textContent="×"+cutDepthFactor.toFixed(2);
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
  updateEstimateSelectionNote();
  updateEstimateHoleSelectionNote();
  enableDirectNumberEntry(qs("estimatePanel"));
}
qs("estimateBtn")?.addEventListener("click",()=>{
  const open=!qs("estimatePanel")?.classList.contains("hidden");
  if(open)closeEstimatePanel();else openEstimatePanel();
});
qs("closeEstimateBtn")?.addEventListener("click",closeEstimatePanel);
qs("markOuterBtn")?.addEventListener("click",()=>markEstimateKind("outer"));
qs("markGrooveBtn")?.addEventListener("click",()=>markEstimateKind("groove"));
qs("clearEstimateKindBtn")?.addEventListener("click",()=>markEstimateKind(null));
qs("markHoleBtn")?.addEventListener("click",()=>markEstimateHoleKind("hole"));
qs("markTapBtn")?.addEventListener("click",()=>markEstimateHoleKind("tap"));
qs("clearEstimateHoleBtn")?.addEventListener("click",()=>markEstimateHoleKind(null));
qs("scanEstimateBtn")?.addEventListener("click",scanDrawingForEstimate);
qs("saveEstimateSettingsBtn")?.addEventListener("click",saveEstimatorSettings);
for(const id of [...EST_SETTING_IDS,...EST_VALUE_IDS])qs(id)?.addEventListener("input",calculateEstimate);
document.querySelectorAll(".tool[data-tool]").forEach(btn=>btn.addEventListener("click",closeEstimatePanel));
qs("layerBtn")?.addEventListener("click",closeEstimatePanel);
qs("sheetBtn")?.addEventListener("click",closeEstimatePanel);
loadEstimatorSettings();
calculateEstimate();
