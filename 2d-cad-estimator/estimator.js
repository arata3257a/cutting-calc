const ESTIMATOR_SETTINGS_KEY="easy-2d-cad-estimator-settings-v1";
const EST_TAP_DRILLS={M3:2.5,M4:3.3,M5:4.2,M6:5.0,M8:6.8,M10:8.5,M12:10.2};
const EST_SETTING_IDS=[
  "estHourlyRate","estThickness","estSetupMin",
  "estHoleMin","estHoleDepth","estTapMin","estTapDepth","estOuterSpeed","estOuterDepth","estGrooveSpeed","estGrooveDepth","estTapTolerance"
];
const EST_VALUE_IDS=["estHoleCount","estTapCount","estOuterLength","estGrooveLength"];

function estNum(id,fallback=0){
  const v=Number(qs(id)?.value);
  return Number.isFinite(v)?v:fallback;
}
function loadEstimatorSettings(){
  const defaults={
    estHourlyRate:6000,estThickness:10,estSetupMin:15,
    estHoleMin:.6,estHoleDepth:10,
    estTapMin:1.5,estTapDepth:10,
    estOuterSpeed:120,estOuterDepth:10,
    estGrooveSpeed:100,estGrooveDepth:5,
    estTapTolerance:.12
  };
  let saved={};
  try{saved=JSON.parse(localStorage.getItem(ESTIMATOR_SETTINGS_KEY))||{}}catch{}
  const migrated={...saved};
  if(!("estHoleDepth" in migrated)) migrated.estHoleDepth=("estThickness" in saved?saved.estThickness:defaults.estHoleDepth);
  if(!("estTapDepth" in migrated)) migrated.estTapDepth=("estThickness" in saved?saved.estThickness:defaults.estTapDepth);
  if(!("estOuterDepth" in migrated)) migrated.estOuterDepth=("estThickness" in saved?saved.estThickness:defaults.estOuterDepth);
  if(!("estGrooveDepth" in migrated)) migrated.estGrooveDepth=("estCutDepth" in saved?saved.estCutDepth:defaults.estGrooveDepth);
  for(const id of EST_SETTING_IDS) if(qs(id)) qs(id).value=(id in migrated?migrated[id]:defaults[id]);
}
function saveEstimatorSettings(silent=false){
  const data={};
  for(const id of EST_SETTING_IDS) data[id]=estNum(id);
  localStorage.setItem(ESTIMATOR_SETTINGS_KEY,JSON.stringify(data));
  if(!silent) hint.textContent="見積設定を保存しました";
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
    const tap=estTapMatch(minD,tapTolerance);
    if(tap){
      tapCount++;
      tapBreakdown[tap]=(tapBreakdown[tap]||0)+1;
    }else{
      holeCount++;
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
  const holeDepth=Math.max(0,estNum("estHoleDepth",10));
  const tapDepth=Math.max(0,estNum("estTapDepth",10));
  const outerDepth=Math.max(0,estNum("estOuterDepth",10));
  const grooveDepth=Math.max(0,estNum("estGrooveDepth",5));
  const holeDepthFactor=holeDepth/10;
  const tapDepthFactor=tapDepth/10;
  const outerDepthFactor=outerDepth/10;
  const grooveDepthFactor=grooveDepth/10;
  const setup=Math.max(0,estNum("estSetupMin"));
  const holes=Math.max(0,estNum("estHoleCount"));
  const taps=Math.max(0,estNum("estTapCount"));
  const outer=Math.max(0,estNum("estOuterLength"));
  const groove=Math.max(0,estNum("estGrooveLength"));

  // 加工種類ごとに設定した深さで個別に補正する。
  const holeTime=holes*Math.max(0,estNum("estHoleMin"))*holeDepthFactor;
  const tapTime=taps*Math.max(0,estNum("estTapMin"))*tapDepthFactor;
  const outerTime=outer/Math.max(.01,estNum("estOuterSpeed",1))*outerDepthFactor;
  const grooveTime=groove/Math.max(.01,estNum("estGrooveSpeed",1))*grooveDepthFactor;
  const total=setup+holeTime+tapTime+outerTime+grooveTime;
  const cost=Math.round(total/60*hourly);

  qs("estHoleTime").textContent=holeTime.toFixed(1)+"分";
  qs("estTapTime").textContent=tapTime.toFixed(1)+"分";
  qs("estOuterTime").textContent=outerTime.toFixed(1)+"分";
  qs("estGrooveTime").textContent=grooveTime.toFixed(1)+"分";
  qs("estSetupTime").textContent=setup.toFixed(1)+"分";
  qs("estTotalTime").textContent=total.toFixed(1)+"分";
  qs("estCost").textContent="¥"+cost.toLocaleString("ja-JP");
}
function estimatorEligibleShape(s){
  return !!s && ["line","arc","rect","circle","hole","slot"].includes(s.type);
}

window.handleEstimatorCanvasTap=function(p){
  if(window.estimatorSelectionActive!==true)return;
  const s=hitTest(p,estimatorEligibleShape);
  closeProperty();
  quickPanel?.classList.add("hidden");
  selectedId=null;

  if(!s){
    selectedIds.clear();
    hint.textContent="見積対象を選択してください";
  }else{
    if(selectedIds.has(s.id)) selectedIds.delete(s.id);
    else selectedIds.add(s.id);
    hint.textContent=selectedIds.size
      ?"見積対象を選択中: "+selectedIds.size+"要素"
      :"見積対象を選択してください";
  }

  updateEstimateSelectionNote();
  updateEstimateHoleSelectionNote();
  draw();
};

function enterEstimatorSelectionMode(){
  window.estimatorSelectionActive=true;
  document.body.classList.add("estimator-mode");
  start=null;preview=null;drag=null;opState=null;arcDraft=null;dimDraft=null;dimSnapHover=null;
  cancelMoveDrag();
  closeProperty();
  quickPanel?.classList.add("hidden");
  qs("layerPanel")?.classList.add("hidden");
  qs("dimensionModeDock")?.classList.add("hidden");
  selectedId=null;
  selectedIds.clear();
  draw();
}

function exitEstimatorSelectionMode(){
  window.estimatorSelectionActive=false;
  document.body.classList.remove("estimator-mode");
  selectedId=null;
  selectedIds.clear();
  draw();
}

function buildEstimatePdfSvg(){
  calculateEstimate();
  const base=buildSVG(true);
  const size=base.match(/width="([0-9.]+)mm" height="([0-9.]+)mm"/);
  const baseW=size?Number(size[1]):210;
  const baseH=size?Number(size[2]):148;
  const pageW=297,pageH=210;
  const drawX=10,drawY=8,drawW=277,drawH=156;
  const scaleToFit=Math.min(drawW/baseW,drawH/baseH);
  const shownW=baseW*scaleToFit,shownH=baseH*scaleToFit;
  const tx=drawX+(drawW-shownW)/2;
  const ty=drawY+(drawH-shownH)/2;
  const inner=base
    .replace(/^<\?xml[^>]*>\s*/,"")
    .replace(/^<svg[^>]*>/,"")
    .replace(/<\/svg>\s*$/,"");
  const cost=xmlEscape(qs("estCost")?.textContent||"¥0");
  const totalTime=xmlEscape(qs("estTotalTime")?.textContent||"0.0分");
  const title=xmlEscape(drawingMeta.title||"加工費見積");
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${pageW}mm" height="${pageH}mm" viewBox="0 0 ${pageW} ${pageH}">
<rect width="${pageW}" height="${pageH}" fill="white"/>
<g transform="translate(${tx} ${ty}) scale(${scaleToFit})">${inner}</g>
<g font-family="Arial, 'Noto Sans JP', sans-serif">
  <rect x="10" y="169" width="277" height="31" rx="2" fill="#f7f9fa" stroke="#222" stroke-width="0.5"/>
  <text x="17" y="179" font-size="5" fill="#333">${title}</text>
  <text x="17" y="190" font-size="4.5" fill="#555">推定加工時間  ${totalTime}</text>
  <text x="280" y="190" font-size="7" font-weight="bold" text-anchor="end" fill="#111">概算加工費  ${cost}</text>
  <text x="17" y="197" font-size="3.2" fill="#666">※ 概算用。材料費・工具交換・測定・治具・仕上げ・難易度などは含みません。</text>
</g>
</svg>`;
}

window.buildEstimatePdfSvg=buildEstimatePdfSvg;
window.buildEstimatePdfBlob=async function(){
  return await buildPdfBlobFromSvg(buildEstimatePdfSvg());
};

async function saveEstimatePdf(){
  saveEstimatorSettings(true);
  calculateEstimate();
  const btn=qs("saveEstimatePdfBtn");
  if(btn){btn.disabled=true;btn.textContent="プレビュー作成中…"}
  try{
    closeEstimatePanel();
    if(typeof window.openEstimatePdfPreview!=="function") throw new Error("preview handler unavailable");
    await window.openEstimatePdfPreview();
  }catch(err){
    alert("見積PDFのプレビューを開けませんでした。");
    openEstimatePanel();
  }finally{
    if(btn){btn.disabled=false;btn.textContent="図形＋金額をPDF保存"}
  }
}

function closeEstimatePanel(){
  qs("estimatePanel")?.classList.add("hidden");
  qs("estimateBtn")?.classList.remove("active");
  exitEstimatorSelectionMode();
  hint.textContent=tool==="select"?"図形をタップして選択できます":"操作を続けられます";
}
function openEstimatePanel(){
  enterEstimatorSelectionMode();
  qs("estimatePanel")?.classList.remove("hidden");
  qs("estimateBtn")?.classList.add("active");
  scanDrawingForEstimate();
  updateEstimateSelectionNote();
  updateEstimateHoleSelectionNote();
  enableDirectNumberEntry(qs("estimatePanel"));
  hint.textContent="見積モード：図形をタップして外形・溝・穴・ネジ穴を指定";
}
window.reopenEstimatePanel=openEstimatePanel;

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
for(const id of EST_SETTING_IDS) qs(id)?.addEventListener("input",()=>{
  saveEstimatorSettings(true);
  calculateEstimate();
});
for(const id of EST_VALUE_IDS) qs(id)?.addEventListener("input",calculateEstimate);
qs("saveEstimatePdfBtn")?.addEventListener("click",saveEstimatePdf);
 qs("sheetBtn")?.addEventListener("click",closeEstimatePanel);
loadEstimatorSettings();
calculateEstimate();
