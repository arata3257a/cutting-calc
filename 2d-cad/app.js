const canvas = document.getElementById("cadCanvas");
const ctx = canvas.getContext("2d");
const hint = document.getElementById("hint");
const quickPanel = document.getElementById("quickPanel");
const propertyPanel = document.getElementById("propertyPanel");
const quickFields = document.getElementById("quickFields");
const propertyFields = document.getElementById("propertyFields");

const STORAGE_KEY = "easy-2d-cad-drawing-v3";
const VERSION = 3;
const EPS = 1e-8;

let tool = "select";
let shapes = [];
let selectedId = null;
let start = null;
let preview = null;
let history = [];
let historyIndex = -1;
let scale = 4;
let origin = {x:70,y:400};
let drag = null;
let nextId = 1;
let opState = null;
let arcDraft = null;
let dimDraft = null;
let dimSnapHover = null;
let panDrag = null;
let layerVisibility=Object.fromEntries(Array.from({length:11},(_,i)=>[String(i),true]));
let selectedIds=new Set();
let activeTouchPointers=new Map();
let touchGesture=null;
let touchGestureActive=false;
let drawingMeta={title:"",drawingNo:"",scale:"1:1",author:"",material:"",date:""};
let quickCreatedId=null;
let multiMoveMode="move";
let moveDrag=null;
let movePreviewShapes=[];

const qs = id => document.getElementById(id);
const num = v => Number.isFinite(Number(v)) ? Number(v) : 0;
const round = (v,d=2) => Number(v.toFixed(d));
const newId = () => nextId++;
const selectedShape = () => shapes.find(s => s.id === selectedId) || null;
const currentLayer = () => qs("layerSelect")?.value || "0";
function ensureLayer(name){
  const legacy={"外形":"0","穴":"1","寸法":"2"};
  let v=legacy[String(name)] ?? String(name ?? "0");
  const n=Math.round(Number(v));
  if(!Number.isFinite(n) || n<0 || n>10) v="0";
  else v=String(n);
  if(!(v in layerVisibility)) layerVisibility[v]=true;
  return v;
}
function assignLayer(s,fallback=null){
  s.layer=ensureLayer(s.layer ?? fallback ?? currentLayer());
  if(s.type==="dim" && s.mode!=="horizontal" && s.mode!=="vertical"){
    s.mode=Math.abs((s.x2??0)-(s.x1??0)) >= Math.abs((s.y2??0)-(s.y1??0)) ? "horizontal" : "vertical";
  }
  return s;
}
function isShapeVisible(s){return layerVisibility[s.layer||"0"]!==false;}

function shapeLabel(type){
  return {
    line:"直線",parallel:"平行線",point:"点",rect:"四角",circle:"円",hole:"穴",slot:"長穴",arc:"円弧",
    trim:"トリム",offset:"オフセット",chamfer:"面取り",fillet:"R",copy:"コピー",mirror:"ミラー",
    rotate:"回転",dimension:"寸法線",pan:"画面移動",dim:"寸法線"
  }[type] || type;
}

function deg(v){ return v * 180 / Math.PI; }
function rad(v){ return v * Math.PI / 180; }
function normDeg(v){ v%=360; if(v<0) v+=360; return v; }
function angleOf(cx,cy,p){ return normDeg(deg(Math.atan2(p.y-cy,p.x-cx))); }
function ccwSpan(a1,a2){ return normDeg(a2-a1); }
function angleOnArc(a,a1,a2){ return ccwSpan(a1,a) <= ccwSpan(a1,a2) + 1e-6; }

function rectNorm(s){
  const x1=Math.min(s.x,s.x+s.w), x2=Math.max(s.x,s.x+s.w);
  const y1=Math.min(s.y,s.y+s.h), y2=Math.max(s.y,s.y+s.h);
  return {x1,y1,x2,y2,w:x2-x1,h:y2-y1};
}
function maxCornerValue(s){
  const r=rectNorm(s);
  return Math.max(0,Math.min(r.w,r.h)/2-EPS);
}
function rectPath(s){
  const r=rectNorm(s), c=s.corners||{}, limit=maxCornerValue(s);
  const tl=Math.min(c.tl?.value||0,limit), tr=Math.min(c.tr?.value||0,limit);
  const br=Math.min(c.br?.value||0,limit), bl=Math.min(c.bl?.value||0,limit);
  const S=p=>worldToScreen(p);
  let p=S({x:r.x1+bl,y:r.y1});
  ctx.beginPath(); ctx.moveTo(p.x,p.y);
  p=S({x:r.x2-br,y:r.y1}); ctx.lineTo(p.x,p.y); appendRectCorner("br",c.br,br,r,S);
  p=S({x:r.x2,y:r.y2-tr}); ctx.lineTo(p.x,p.y); appendRectCorner("tr",c.tr,tr,r,S);
  p=S({x:r.x1+tl,y:r.y2}); ctx.lineTo(p.x,p.y); appendRectCorner("tl",c.tl,tl,r,S);
  p=S({x:r.x1,y:r.y1+bl}); ctx.lineTo(p.x,p.y); appendRectCorner("bl",c.bl,bl,r,S);
  ctx.closePath();
}
function appendRectCorner(key,mod,v,r,S){
  if(!mod || v<=EPS){
    const raw={br:{x:r.x2,y:r.y1},tr:{x:r.x2,y:r.y2},tl:{x:r.x1,y:r.y2},bl:{x:r.x1,y:r.y1}}[key];
    const p=S(raw); ctx.lineTo(p.x,p.y); return;
  }
  if(mod.type==="chamfer"){
    const end={br:{x:r.x2,y:r.y1+v},tr:{x:r.x2-v,y:r.y2},tl:{x:r.x1,y:r.y2-v},bl:{x:r.x1+v,y:r.y1}}[key];
    const p=S(end); ctx.lineTo(p.x,p.y); return;
  }
  const centers={br:{x:r.x2-v,y:r.y1+v},tr:{x:r.x2-v,y:r.y2-v},tl:{x:r.x1+v,y:r.y2-v},bl:{x:r.x1+v,y:r.y1+v}};
  const angles={br:[270,360],tr:[0,90],tl:[90,180],bl:[180,270]};
  const c=worldToScreen(centers[key]), a=angles[key];
  ctx.arc(c.x,c.y,v*scale,rad(-a[0]),rad(-a[1]),true);
}

function snapValue(v){ return v; }

function snapPoint(p){
  return {x:p.x,y:p.y};
}

function resize(){
  const r = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.round(r.width*dpr));
  canvas.height = Math.max(1, Math.round(r.height*dpr));
  ctx.setTransform(dpr,0,0,dpr,0,0);
  if(origin.y === 400) origin.y = Math.max(80,r.height-70);
  draw();
}

function screenToWorld(p){
  return {x:(p.x-origin.x)/scale,y:(origin.y-p.y)/scale};
}
function worldToScreen(p){
  return {x:origin.x+p.x*scale,y:origin.y-p.y*scale};
}
function eventWorld(e){
  const r=canvas.getBoundingClientRect();
  return screenToWorld({x:e.clientX-r.left,y:e.clientY-r.top});
}

function snapshot(){
  const state=JSON.stringify(shapes);
  if(history[historyIndex]===state) return;
  history=history.slice(0,historyIndex+1);
  history.push(state);
  historyIndex=history.length-1;
  if(history.length>80){history.shift();historyIndex--}
  autoSave();
}
function restoreHistory(index){
  if(index<0 || index>=history.length) return;
  historyIndex=index;
  shapes=JSON.parse(history[historyIndex]);
  selectedId=null;selectedIds.clear();start=null;preview=null;drag=null;
  closeProperty();
  draw();
  autoSave();
}

function autoSave(){
  localStorage.setItem(STORAGE_KEY,JSON.stringify({
    version:VERSION,unit:"mm",nextId,shapes,drawingMeta,layerVisibility
  }));
}

function syncSheetInputs(){
  if(qs("sheetTitle")) qs("sheetTitle").value=drawingMeta.title||"";
  if(qs("sheetNo")) qs("sheetNo").value=drawingMeta.drawingNo||"";
  if(qs("sheetScale")) qs("sheetScale").value=drawingMeta.scale||"1:1";
  if(qs("sheetName")) qs("sheetName").value=drawingMeta.author||"";
  if(qs("sheetMaterial")) qs("sheetMaterial").value=drawingMeta.material||"";
  if(qs("sheetDate")) qs("sheetDate").value=drawingMeta.date||"";
}

function drawGrid(w,h){
  const left=screenToWorld({x:0,y:h}).x;
  const right=screenToWorld({x:w,y:0}).x;
  const bottom=screenToWorld({x:0,y:h}).y;
  const top=screenToWorld({x:w,y:0}).y;

  // ズームに合わせて 20 → 10 → 5 → 2 → 1 mm と細かくする
  const step =
    scale>=14 ? 1 :
    scale>=8 ? 2 :
    scale>=5 ? 5 :
    scale>=2.5 ? 10 : 20;
  const majorStep=10;

  ctx.save();
  ctx.lineWidth=1;
  ctx.font="10px system-ui";
  ctx.fillStyle="#8d98a3";

  for(let x=Math.floor(left/step)*step;x<=right+EPS;x+=step){
    const sx=worldToScreen({x,y:0}).x;
    const isAxis=Math.abs(x)<0.001;
    const isMajor=Math.abs(x/majorStep-Math.round(x/majorStep))<1e-7;
    ctx.strokeStyle=isAxis?"#a9b2bb":isMajor?"#d8dde2":"#edf0f3";
    ctx.beginPath();ctx.moveTo(sx,0);ctx.lineTo(sx,h);ctx.stroke();
    if(x!==0 && isMajor && sx>20){
      ctx.fillText(String(round(x,0)),sx+2,Math.min(h-4,origin.y+13));
    }
  }

  for(let y=Math.floor(bottom/step)*step;y<=top+EPS;y+=step){
    const sy=worldToScreen({x:0,y}).y;
    const isAxis=Math.abs(y)<0.001;
    const isMajor=Math.abs(y/majorStep-Math.round(y/majorStep))<1e-7;
    ctx.strokeStyle=isAxis?"#a9b2bb":isMajor?"#d8dde2":"#edf0f3";
    ctx.beginPath();ctx.moveTo(0,sy);ctx.lineTo(w,sy);ctx.stroke();
    if(y!==0 && isMajor && sy<h-12){
      ctx.fillText(String(round(y,0)),Math.max(3,origin.x+4),sy-3);
    }
  }
  ctx.restore();
}

function drawDimensionText(text,x,y,selected=false,angle=0){
  ctx.save();
  ctx.translate(x,y);
  if(angle) ctx.rotate(angle);
  ctx.font="12px system-ui";
  const pad=4;
  const width=ctx.measureText(text).width+pad*2;
  ctx.fillStyle="rgba(255,255,255,.92)";
  ctx.fillRect(-width/2,-10,width,16);
  ctx.fillStyle=selected ? "#0b63ce" : "#4d5965";
  ctx.textAlign="center";
  ctx.fillText(text,0,2);
  ctx.restore();
}

function drawShape(s,isPreview=false){
  const selected = !isPreview && (s.id===selectedId || selectedIds.has(s.id));
  ctx.save();
  ctx.strokeStyle = isPreview ? "#7c8792" : selected ? "#0b63ce" : "#111820";
  ctx.lineWidth = selected ? 3 : 2;
  if(isPreview) ctx.setLineDash([6,5]);

  if(s.type==="point"){
    const p=worldToScreen({x:s.x,y:s.y});
    ctx.fillStyle=selected?"#0b63ce":"#111820";
    ctx.beginPath();ctx.arc(p.x,p.y,selected?5:4,0,Math.PI*2);ctx.fill();
    ctx.beginPath();
    ctx.moveTo(p.x-8,p.y);ctx.lineTo(p.x+8,p.y);
    ctx.moveTo(p.x,p.y-8);ctx.lineTo(p.x,p.y+8);ctx.stroke();
  }

  if(s.type==="line"){
    const a=worldToScreen({x:s.x1,y:s.y1});
    const b=worldToScreen({x:s.x2,y:s.y2});
    ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();
    const len=Math.hypot(s.x2-s.x1,s.y2-s.y1);
    drawDimensionText(`${round(len)} mm`,(a.x+b.x)/2,(a.y+b.y)/2-8,selected);
  }

  if(s.type==="rect"){
    rectPath(s); ctx.stroke();
    const r=rectNorm(s);
    const a=worldToScreen({x:r.x1,y:r.y2}), b=worldToScreen({x:r.x2,y:r.y2});
    drawDimensionText(round(r.w)+" × "+round(r.h)+" mm",(a.x+b.x)/2,a.y-7,selected);
  }

  if(s.type==="circle" || s.type==="hole"){
    const c=worldToScreen({x:s.cx,y:s.cy});
    ctx.beginPath();ctx.arc(c.x,c.y,Math.abs(s.r*scale),0,Math.PI*2);ctx.stroke();
    if(s.type==="hole"){
      if(s.counterD && s.counterD>s.r*2){
        ctx.beginPath();ctx.arc(c.x,c.y,(s.counterD/2)*scale,0,Math.PI*2);ctx.stroke();
      }
      const mark=Math.max(5,Math.min(12,Math.abs(s.r*scale)*0.7));
      ctx.beginPath();ctx.moveTo(c.x-mark,c.y);ctx.lineTo(c.x+mark,c.y);
      ctx.moveTo(c.x,c.y-mark);ctx.lineTo(c.x,c.y+mark);ctx.stroke();
      let label;
      if(s.holeKind==="counterbore") label="ザグリ Ø"+round(s.r*2)+" / Ø"+round(s.counterD||0);
      else if(s.holeKind==="countersink") label="皿穴 Ø"+round(s.r*2)+" / Ø"+round(s.counterD||0);
      else if(s.holeKind && s.holeKind!=="through") label=s.holeKind+" 下穴 Ø"+round(Math.abs(s.r*2));
      else label="穴 Ø"+round(Math.abs(s.r*2));
      const labelR=Math.max(Math.abs(s.r),Math.abs((s.counterD||0)/2));
      drawDimensionText(label,c.x,c.y-labelR*scale-7,selected);
    }else{
      drawDimensionText(`Ø${round(Math.abs(s.r*2))}`,c.x,c.y-Math.abs(s.r*scale)-7,selected);
    }
  }

  if(s.type==="slot"){
    drawSlotPath(s);
    ctx.stroke();
    drawDimensionText(round(s.length)+" × "+round(s.width)+" mm",
      worldToScreen({x:s.cx,y:s.cy+s.width/2}).x,
      worldToScreen({x:s.cx,y:s.cy+s.width/2}).y-7,selected);
  }

  if(s.type==="arc"){
    const c=worldToScreen({x:s.cx,y:s.cy});
    ctx.beginPath();
    ctx.arc(c.x,c.y,Math.abs(s.r*scale),rad(-s.a1),rad(-s.a2),true);
    ctx.stroke();
    const mid=normDeg(s.a1+ccwSpan(s.a1,s.a2)/2);
    const p=worldToScreen({x:s.cx+s.r*Math.cos(rad(mid)),y:s.cy+s.r*Math.sin(rad(mid))});
    drawDimensionText("R"+round(s.r),p.x,p.y-8,selected);
  }

  if(s.type==="dim"){
    drawDimensionShape(s,selected,isPreview);
  }

  ctx.restore();
}

function drawDimensionShape(s,selected=false,isPreview=false){
  const a=worldToScreen({x:s.x1,y:s.y1});
  const b=worldToScreen({x:s.x2,y:s.y2});
  const q=worldToScreen({x:s.tx,y:s.ty});
  const mode=s.mode==="vertical"?"vertical":"horizontal";
  let oa,ob,value;

  if(mode==="vertical"){
    oa={x:q.x,y:a.y}; ob={x:q.x,y:b.y}; value=Math.abs(s.y2-s.y1);
  }else{
    oa={x:a.x,y:q.y}; ob={x:b.x,y:q.y}; value=Math.abs(s.x2-s.x1);
  }

  ctx.save();
  ctx.strokeStyle=isPreview?"#7c8792":selected?"#0b63ce":"#4d5965";
  ctx.lineWidth=1.2;
  if(isPreview)ctx.setLineDash([5,4]);
  const dimLabel=round(value)+" mm";
  const span=Math.hypot(ob.x-oa.x,ob.y-oa.y)||1;
  const ux=(ob.x-oa.x)/span,uy=(ob.y-oa.y)/span,ah=6;
  const textX=(oa.x+ob.x)/2;
  const textY=(oa.y+ob.y)/2;

  ctx.font="12px system-ui";
  const labelWidth=ctx.measureText(dimLabel).width;
  const maxGapHalf=Math.max(0,span/2-ah-2);
  const gapHalf=Math.min(labelWidth/2+6,maxGapHalf);
  const g1={x:textX-ux*gapHalf,y:textY-uy*gapHalf};
  const g2={x:textX+ux*gapHalf,y:textY+uy*gapHalf};

  ctx.beginPath();
  ctx.moveTo(a.x,a.y);ctx.lineTo(oa.x,oa.y);
  ctx.moveTo(b.x,b.y);ctx.lineTo(ob.x,ob.y);
  if(gapHalf>0){
    ctx.moveTo(oa.x,oa.y);ctx.lineTo(g1.x,g1.y);
    ctx.moveTo(g2.x,g2.y);ctx.lineTo(ob.x,ob.y);
  }else{
    ctx.moveTo(oa.x,oa.y);ctx.lineTo(ob.x,ob.y);
  }
  ctx.moveTo(oa.x,oa.y);ctx.lineTo(oa.x+ux*ah-uy*3,oa.y+uy*ah+ux*3);
  ctx.moveTo(oa.x,oa.y);ctx.lineTo(oa.x+ux*ah+uy*3,oa.y+uy*ah-ux*3);
  ctx.moveTo(ob.x,ob.y);ctx.lineTo(ob.x-ux*ah-uy*3,ob.y-uy*ah+ux*3);
  ctx.moveTo(ob.x,ob.y);ctx.lineTo(ob.x-ux*ah+uy*3,ob.y-uy*ah-ux*3);
  ctx.stroke();

  if(mode==="vertical"){
    drawDimensionText(dimLabel,textX,textY,selected,-Math.PI/2);
  }else{
    drawDimensionText(dimLabel,textX,textY,selected);
  }
  ctx.restore();
}

function drawSlotPath(s){
  const c=worldToScreen({x:s.cx,y:s.cy});
  const total=Math.max(Math.abs(s.length),Math.abs(s.width));
  const width=Math.min(Math.abs(s.length),Math.abs(s.width));
  const r=(width/2)*scale;
  const halfStraight=Math.max(0,(total-width)/2)*scale;
  ctx.beginPath();
  ctx.moveTo(c.x-halfStraight,c.y-r);
  ctx.lineTo(c.x+halfStraight,c.y-r);
  ctx.arc(c.x+halfStraight,c.y,r,-Math.PI/2,Math.PI/2);
  ctx.lineTo(c.x-halfStraight,c.y+r);
  ctx.arc(c.x-halfStraight,c.y,r,Math.PI/2,Math.PI*1.5);
  ctx.closePath();
}

function drawDimensionSnapMarker(p){
  if(!p) return;
  const q=worldToScreen(p);
  ctx.save();
  ctx.strokeStyle="#0b63ce";
  ctx.fillStyle="rgba(255,255,255,.95)";
  ctx.lineWidth=2;
  ctx.beginPath();ctx.arc(q.x,q.y,6,0,Math.PI*2);ctx.fill();ctx.stroke();
  ctx.beginPath();ctx.moveTo(q.x-9,q.y);ctx.lineTo(q.x+9,q.y);
  ctx.moveTo(q.x,q.y-9);ctx.lineTo(q.x,q.y+9);ctx.stroke();
  ctx.restore();
}

function draw(){
  const r=canvas.getBoundingClientRect();
  ctx.clearRect(0,0,r.width,r.height);
  drawGrid(r.width,r.height);
  shapes.filter(isShapeVisible).forEach(s=>drawShape(s));
  movePreviewShapes.forEach(s=>drawShape(s,true));
  if(preview) drawShape(preview,true);
  if(["line","dimension","copy","mirror","rotate","multi","point"].includes(tool) && dimSnapHover) drawDimensionSnapMarker(dimSnapHover);
}

function shapeFromPoints(a,b,allocateId=true){
  const id=allocateId ? newId() : -1, layer=currentLayer();
  if(tool==="line") return {id,type:"line",x1:a.x,y1:a.y,x2:b.x,y2:b.y,layer};
  if(tool==="rect") return {id,type:"rect",x:a.x,y:a.y,w:b.x-a.x,h:b.y-a.y,corners:{},layer};
  if(tool==="circle"){
    return {id,type:"circle",cx:a.x,cy:a.y,r:Math.max(.1,Math.hypot(b.x-a.x,b.y-a.y)),layer};
  }
  if(tool==="hole"){
    return {id,type:"hole",cx:a.x,cy:a.y,r:Math.max(.1,Math.hypot(b.x-a.x,b.y-a.y)),holeKind:"through",layer};
  }
  if(tool==="slot"){
    const cx=(a.x+b.x)/2, cy=(a.y+b.y)/2;
    return {id,type:"slot",cx,cy,length:Math.max(Math.abs(b.x-a.x),Math.abs(b.y-a.y)),width:Math.min(Math.abs(b.x-a.x),Math.abs(b.y-a.y)),layer};
  }
  return null;
}


function lineLength(s){return Math.hypot(s.x2-s.x1,s.y2-s.y1)}
function sameLineRay(a,b){
  if(a.type!=="line"||b.type!=="line")return false;
  if((a.layer||"0")!==(b.layer||"0"))return false;
  if(Math.hypot(a.x1-b.x1,a.y1-b.y1)>1e-6)return false;
  const la=lineLength(a),lb=lineLength(b);
  if(la<EPS||lb<EPS)return false;
  const au={x:(a.x2-a.x1)/la,y:(a.y2-a.y1)/la};
  const bu={x:(b.x2-b.x1)/lb,y:(b.y2-b.y1)/lb};
  return au.x*bu.x+au.y*bu.y>0.999999;
}
function cleanupRedundantLines(){
  const remove=new Set();
  for(let i=0;i<shapes.length;i++){
    if(remove.has(i)||shapes[i].type!=="line")continue;
    for(let j=i+1;j<shapes.length;j++){
      if(remove.has(j)||shapes[j].type!=="line")continue;
      if(!sameLineRay(shapes[i],shapes[j]))continue;
      const li=lineLength(shapes[i]),lj=lineLength(shapes[j]);
      if(li>=lj)remove.add(j);else{remove.add(i);break;}
    }
  }
  if(remove.size)shapes=shapes.filter((_,i)=>!remove.has(i));
  return remove.size;
}

function distancePointSegment(p,a,b){
  const vx=b.x-a.x, vy=b.y-a.y;
  const wx=p.x-a.x, wy=p.y-a.y;
  const c1=vx*wx+vy*wy;
  if(c1<=0) return Math.hypot(p.x-a.x,p.y-a.y);
  const c2=vx*vx+vy*vy;
  if(c2<=c1) return Math.hypot(p.x-b.x,p.y-b.y);
  const t=c1/c2;
  return Math.hypot(p.x-(a.x+t*vx),p.y-(a.y+t*vy));
}

function hitShape(s,p){
  const tol=8/scale;
  if(s.type==="point") return Math.hypot(p.x-s.x,p.y-s.y)<=10/scale;
  if(s.type==="line") return distancePointSegment(p,{x:s.x1,y:s.y1},{x:s.x2,y:s.y2})<=tol;
  if(s.type==="circle") return Math.abs(Math.hypot(p.x-s.cx,p.y-s.cy)-Math.abs(s.r))<=tol || Math.hypot(p.x-s.cx,p.y-s.cy)<=tol;
  if(s.type==="hole"){
    const rr=Math.max(Math.abs(s.r),Math.abs((s.counterD||0)/2));
    return Math.abs(Math.hypot(p.x-s.cx,p.y-s.cy)-rr)<=tol || Math.hypot(p.x-s.cx,p.y-s.cy)<=tol;
  }
  if(s.type==="arc"){
    const d=Math.hypot(p.x-s.cx,p.y-s.cy);
    return Math.abs(d-s.r)<=tol && angleOnArc(angleOf(s.cx,s.cy,p),s.a1,s.a2);
  }
  if(s.type==="rect"){
    const x1=Math.min(s.x,s.x+s.w)-tol,x2=Math.max(s.x,s.x+s.w)+tol;
    const y1=Math.min(s.y,s.y+s.h)-tol,y2=Math.max(s.y,s.y+s.h)+tol;
    return p.x>=x1&&p.x<=x2&&p.y>=y1&&p.y<=y2;
  }
  if(s.type==="slot"){
    const halfL=s.length/2+tol, halfW=s.width/2+tol;
    return Math.abs(p.x-s.cx)<=halfL && Math.abs(p.y-s.cy)<=halfW;
  }
  if(s.type==="dim"){
    return distancePointSegment(p,{x:s.x1,y:s.y1},{x:s.x2,y:s.y2})<=tol*2 ||
      Math.hypot(p.x-s.tx,p.y-s.ty)<=tol*2;
  }
  return false;
}

function hitTest(p,filter=null){
  for(let i=shapes.length-1;i>=0;i--){
    if(isShapeVisible(shapes[i]) && (!filter || filter(shapes[i])) && hitShape(shapes[i],p)) return shapes[i];
  }
  return null;
}

function translateShape(s,dx,dy){
  if(s.type==="point"){s.x+=dx;s.y+=dy}
  if(s.type==="line"){s.x1+=dx;s.y1+=dy;s.x2+=dx;s.y2+=dy}
  if(s.type==="rect"){s.x+=dx;s.y+=dy}
  if(s.type==="circle" || s.type==="hole" || s.type==="arc"){s.cx+=dx;s.cy+=dy}
  if(s.type==="slot"){s.cx+=dx;s.cy+=dy}
  if(s.type==="dim"){s.x1+=dx;s.y1+=dy;s.x2+=dx;s.y2+=dy;s.tx+=dx;s.ty+=dy}
}

function restoreMoveDragOriginals(){
  if(!moveDrag || moveDrag.mode!=="move") return;
  for(const item of moveDrag.before){
    const target=shapes.find(s=>s.id===item.id);
    if(target) Object.assign(target,JSON.parse(JSON.stringify(item.shape)));
  }
}

function cancelMoveDrag(){
  if(!moveDrag){movePreviewShapes=[];return;}
  restoreMoveDragOriginals();
  moveDrag=null;movePreviewShapes=[];dimSnapHover=null;
}

function startMoveDragFromSnap(snap,pointerId){
  const targets=shapes.filter(s=>selectedIds.has(s.id));
  if(!targets.length) return;
  moveDrag={
    pointerId,
    mode:multiMoveMode,
    base:{x:snap.x,y:snap.y},
    before:targets.map(s=>({id:s.id,shape:JSON.parse(JSON.stringify(s))})),
    moved:false
  };
  movePreviewShapes=[];
  dimSnapHover={x:snap.x,y:snap.y};
  hint.textContent=snap.kind+"をつかみました。そのままドラッグ";
  draw();
}

function updateMoveDrag(raw){
  if(!moveDrag) return;
  const excluded=moveDrag.mode==="move"?new Set(moveDrag.before.map(x=>x.id)):null;
  const snap=findTransformSnap(raw,24,excluded);
  const target=snap?{x:snap.x,y:snap.y}:raw;
  const dx=target.x-moveDrag.base.x,dy=target.y-moveDrag.base.y;
  if(Math.hypot(dx,dy)*scale>4) moveDrag.moved=true;
  dimSnapHover=snap?{x:snap.x,y:snap.y}:null;

  if(moveDrag.mode==="move"){
    for(const item of moveDrag.before){
      const targetShape=shapes.find(s=>s.id===item.id);
      if(!targetShape) continue;
      Object.assign(targetShape,JSON.parse(JSON.stringify(item.shape)));
      translateShape(targetShape,dx,dy);
    }
  }else{
    movePreviewShapes=moveDrag.before.map((item,i)=>{
      const s=JSON.parse(JSON.stringify(item.shape));
      s.id=-100000-i;
      translateShape(s,dx,dy);
      return s;
    });
  }
  draw();
}

function finishMoveDrag(){
  if(!moveDrag) return;
  const mode=moveDrag.mode,moved=moveDrag.moved,count=moveDrag.before.length;
  if(!moved){
    restoreMoveDragOriginals();
    moveDrag=null;movePreviewShapes=[];dimSnapHover=null;
    hint.textContent="端点・中点・中心・交点をつかんでドラッグ";
    draw();return;
  }
  if(mode==="copy"){
    const copies=movePreviewShapes.map(s=>{
      const c=JSON.parse(JSON.stringify(s));c.id=newId();return c;
    });
    shapes.push(...copies);
    selectedIds=new Set(copies.map(s=>s.id));
  }
  moveDrag=null;movePreviewShapes=[];dimSnapHover=null;
  snapshot();openMultiPanel();
  hint.textContent=mode==="copy"?count+"個をドラッグコピーしました":count+"個をドラッグ移動しました";
  draw();
}

canvas.addEventListener("pointerdown",e=>{
  canvas.setPointerCapture?.(e.pointerId);

  if(e.pointerType==="touch"){
    activeTouchPointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
    if(activeTouchPointers.size>=2){
      cancelMoveDrag();
      const pts=[...activeTouchPointers.values()].slice(0,2);
      const r=canvas.getBoundingClientRect();
      const mid={x:(pts[0].x+pts[1].x)/2-r.left,y:(pts[0].y+pts[1].y)/2-r.top};
      const dist=Math.hypot(pts[1].x-pts[0].x,pts[1].y-pts[0].y)||1;
      touchGesture={
        startDist:dist,startScale:scale,
        worldAtMid:screenToWorld(mid)
      };
      touchGestureActive=true;
      start=null;preview=null;drag=null;arcDraft=null;dimDraft=null;opState=null;
      closeProperty();draw();
      hint.textContent="2本指で移動・ピンチで拡大縮小";
      return;
    }
  }

  const raw=eventWorld(e);
  let p=snapPoint(raw);
  let lineSnap=null;
  if(tool==="line"){
    lineSnap=findTransformSnap(raw);
    if(lineSnap){
      p={x:lineSnap.x,y:lineSnap.y};
      dimSnapHover={x:lineSnap.x,y:lineSnap.y};
    }else{
      dimSnapHover=null;
    }
  }

  if(tool==="pan"){
    panDrag={sx:e.clientX,sy:e.clientY,ox:origin.x,oy:origin.y};
    hint.textContent="ドラッグして表示位置を移動";
    return;
  }
  if(tool==="dimension"){ handleDimensionTap(p); return; }
  if(tool==="multi"){
    if(selectedIds.size){
      const selectedHit=hitTest(raw,s=>selectedIds.has(s.id));
      const baseSnap=selectedHit?findTransformSnap(raw):null;
      if(baseSnap){startMoveDragFromSnap(baseSnap,e.pointerId);return;}
    }
    handleMultiTap(raw);return;
  }
  if(tool==="trim"){ handleTrimTap(raw); return; }
  if(tool==="offset"){ handleOffsetTap(raw); return; }
  if(tool==="parallel"){ handleParallelTap(raw); return; }
  if(tool==="point"){ handlePointTap(raw); return; }
  if(tool==="chamfer" || tool==="fillet"){ handleCornerTap(raw); return; }
  if(tool==="copy"){ handleCopyTap(raw); return; }
  if(tool==="mirror"){ handleMirrorTap(raw); return; }
  if(tool==="rotate"){ handleRotateTap(raw); return; }
  if(tool==="arc"){ handleArcTap(p); return; }

  if(tool==="select"){
    const s=hitTest(raw);
    selectedId=s?.id ?? null;
    drag=null;
    if(s){
      openProperty(s);
      hint.textContent="選択しました。数値を変更できます";
    }else{
      closeProperty();
      hint.textContent="図形をタップして選択できます";
    }
    draw();
    return;
  }

  if(!start){
    start=p;
    hint.textContent=lineSnap
      ? lineSnap.kind+"から開始。終点の端点・中点・中心・頂点をタップ"
      : "終点をタップしてください";
    draw();
  }else{
    const shape=shapeFromPoints(start,p);
    if(shape){
      shapes.push(shape);
      selectedId=shape.id;
      snapshot();
    }
    start=null;preview=null;dimSnapHover=null;
    hint.textContent=lineSnap
      ? lineSnap.kind+"まで線を作成しました"
      : "続けて作図できます";
    draw();
  }
});

canvas.addEventListener("pointermove",e=>{
  if(e.pointerType==="touch" && activeTouchPointers.has(e.pointerId)){
    activeTouchPointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
  }
  if(touchGestureActive){
    if(activeTouchPointers.size>=2 && touchGesture){
      const pts=[...activeTouchPointers.values()].slice(0,2);
      const r=canvas.getBoundingClientRect();
      const mid={x:(pts[0].x+pts[1].x)/2-r.left,y:(pts[0].y+pts[1].y)/2-r.top};
      const dist=Math.hypot(pts[1].x-pts[0].x,pts[1].y-pts[0].y)||1;
      const nextScale=Math.max(.3,Math.min(20,touchGesture.startScale*(dist/touchGesture.startDist)));
      scale=nextScale;
      origin.x=mid.x-touchGesture.worldAtMid.x*scale;
      origin.y=mid.y+touchGesture.worldAtMid.y*scale;
      draw();
    }
    return;
  }

  if(tool==="pan" && panDrag){
    origin.x=panDrag.ox+(e.clientX-panDrag.sx);
    origin.y=panDrag.oy+(e.clientY-panDrag.sy);
    draw(); return;
  }
  const raw=eventWorld(e);

  if(tool==="multi" && moveDrag){
    updateMoveDrag(raw);return;
  }

  if(tool==="line"){
    const snap=findTransformSnap(raw);
    dimSnapHover=snap?{x:snap.x,y:snap.y}:null;
    if(start){
      const p=snap?{x:snap.x,y:snap.y}:snapPoint(raw);
      preview=shapeFromPoints(start,p,false);
    }
    draw();return;
  }

  if(tool==="point"){
    const snap=findPointPlacementSnap(raw);
    dimSnapHover=snap?{x:snap.x,y:snap.y}:null;
    draw();return;
  }

  if(transformToolNeedsSnap()){
    const snap=findTransformSnap(raw);
    dimSnapHover=snap?{x:snap.x,y:snap.y}:null;
    draw();return;
  }

  if(tool==="dimension" && (!dimDraft || dimDraft.stage===1)){
    const snap=findDimensionSnap(raw);
    dimSnapHover=snap?{x:snap.x,y:snap.y}:null;
    draw();return;
  }

  if(tool==="dimension" && dimDraft?.stage===2){
    const p=snapPoint(raw);
    preview={id:-1,type:"dim",x1:dimDraft.a.x,y1:dimDraft.a.y,x2:dimDraft.b.x,y2:dimDraft.b.y,
      tx:p.x,ty:p.y,mode:qs("dimensionModeSelect")?.value==="vertical"?"vertical":"horizontal"};
    draw();return;
  }

  if(tool==="arc" && arcDraft?.stage===1){
    const p=snapPoint(raw);
    preview={id:-1,type:"arc",cx:arcDraft.c.x,cy:arcDraft.c.y,
      r:Math.max(.1,Math.hypot(p.x-arcDraft.c.x,p.y-arcDraft.c.y)),
      a1:angleOf(arcDraft.c.x,arcDraft.c.y,p),
      a2:normDeg(angleOf(arcDraft.c.x,arcDraft.c.y,p)+180)};
    draw(); return;
  }
  if(tool==="arc" && arcDraft?.stage===2){
    const p=snapPoint(raw);
    preview={id:-1,type:"arc",cx:arcDraft.c.x,cy:arcDraft.c.y,r:arcDraft.r,
      a1:arcDraft.a1,a2:angleOf(arcDraft.c.x,arcDraft.c.y,p)};
    draw(); return;
  }

  if(start){
    const p=snapPoint(raw);
    preview=shapeFromPoints(start,p,false);
    draw();
  }
});

canvas.addEventListener("pointerup",e=>{
  if(e.pointerType==="touch"){
    activeTouchPointers.delete(e.pointerId);
    if(touchGestureActive){
      if(activeTouchPointers.size<2) touchGesture=null;
      if(activeTouchPointers.size===0){
        touchGestureActive=false;
        hint.textContent=tool==="select"?"図形をタップして選択できます":"操作を続けられます";
      }
      return;
    }
  }
  if(tool==="multi" && moveDrag && moveDrag.pointerId===e.pointerId){
    finishMoveDrag();return;
  }
  if(tool==="pan" && panDrag){panDrag=null;hint.textContent="画面をドラッグして移動";return;}
});

canvas.addEventListener("pointercancel",e=>{
  if(moveDrag && moveDrag.pointerId===e.pointerId){cancelMoveDrag();draw();}
});

function setTool(next){
  cancelMoveDrag();
  tool=next;start=null;preview=null;drag=null;opState=null;arcDraft=null;dimDraft=null;dimSnapHover=null;panDrag=null;
  quickCreatedId=null;
  qs("dimensionModeDock")?.classList.toggle("hidden",tool!=="dimension");
  document.querySelectorAll(".tool").forEach(b=>b.classList.toggle("active",b.dataset.tool===tool));
  qs("layerBtn")?.classList.toggle("active",!qs("layerPanel")?.classList.contains("hidden"));
  selectedId=null;
  if(tool!=="multi") selectedIds.clear();
  closeProperty();quickPanel.classList.add("hidden");
  qs("createByValueBtn").hidden=false;
  qs("createByValueBtn").textContent="この寸法で作成";

  if(tool==="select") hint.textContent="図形をタップして選択できます";
  else if(tool==="trim") hint.textContent="削る側の直線をタップ";
  else if(tool==="offset") hint.textContent="オフセット元の図形をタップ";
  else if(tool==="parallel") hint.textContent="平行線の元になる直線をタップ";
  else if(tool==="point") hint.textContent="端点・中点・中心・交点・円の頂点をタップ";
  else if(tool==="chamfer") hint.textContent="面取りする四角の角をタップ";
  else if(tool==="fillet") hint.textContent="Rを付ける四角の角をタップ";
  else if(tool==="copy") hint.textContent="コピーする図形をタップ（移動量／点から点）";
  else if(tool==="mirror") hint.textContent="ミラーする図形をタップ → 軸を2点で指定";
  else if(tool==="rotate") hint.textContent="回転する図形をタップ → 回転中心を選択";
  else if(tool==="dimension") hint.textContent="端点・交点・円の頂点をタップ";
  else if(tool==="multi"){hint.textContent="図形を選択 → 端点・中点・中心・交点をドラッグ";openMultiPanel();}
  else if(tool==="pan") hint.textContent="画面をドラッグして移動";
  else if(tool==="parallel" || tool==="point"){
    // 元図形やスナップ点を選ぶまでは入力パネルを出さない
  }else if(tool==="line"){
    openQuick(tool);
    hint.textContent="端点・中点・中心・頂点をつないで作図、または数値入力";
  }else if(tool==="arc"){
    openQuick(tool);
    hint.textContent="中心→始点→終点の順にタップ、または数値入力";
  }else{
    openQuick(tool);
    hint.textContent="始点をタップ、または数値入力";
  }
  draw();
}

document.querySelectorAll(".tool[data-tool]").forEach(btn=>btn.addEventListener("click",()=>setTool(btn.dataset.tool)));
function setDimensionMode(mode){
  const value=mode==="vertical"?"vertical":"horizontal";
  if(qs("dimensionModeSelect")) qs("dimensionModeSelect").value=value;
  qs("dimHorizontalBtn")?.classList.toggle("active",value==="horizontal");
  qs("dimVerticalBtn")?.classList.toggle("active",value==="vertical");
  hint.textContent=value==="horizontal"?"水平寸法：端点・交点・円の頂点を選択":"垂直寸法：端点・交点・円の頂点を選択";
}
qs("dimHorizontalBtn")?.addEventListener("click",()=>setDimensionMode("horizontal"));
qs("dimVerticalBtn")?.addEventListener("click",()=>setDimensionMode("vertical"));



function dimensionEndpointCandidates(){
  const pts=[];
  for(const s of shapes){
    if(!isShapeVisible(s)) continue;
    if(s.type==="line"){
      pts.push({x:s.x1,y:s.y1,kind:"端点"},{x:s.x2,y:s.y2,kind:"端点"});
    }else if(s.type==="arc"){
      pts.push(
        {x:s.cx+s.r*Math.cos(rad(s.a1)),y:s.cy+s.r*Math.sin(rad(s.a1)),kind:"端点"},
        {x:s.cx+s.r*Math.cos(rad(s.a2)),y:s.cy+s.r*Math.sin(rad(s.a2)),kind:"端点"}
      );
    }else if(s.type==="rect"){
      const r=rectNorm(s);
      pts.push(
        {x:r.x1,y:r.y1,kind:"端点"},{x:r.x2,y:r.y1,kind:"端点"},
        {x:r.x2,y:r.y2,kind:"端点"},{x:r.x1,y:r.y2,kind:"端点"}
      );
    }else if(s.type==="circle" || s.type==="hole"){
      pts.push(
        {x:s.cx+s.r,y:s.cy,kind:"円の頂点"},
        {x:s.cx-s.r,y:s.cy,kind:"円の頂点"},
        {x:s.cx,y:s.cy+s.r,kind:"円の頂点"},
        {x:s.cx,y:s.cy-s.r,kind:"円の頂点"}
      );
    }
  }
  return pts;
}

function dimensionPrimitives(excludeIds=null){
  const lines=[],circles=[],arcs=[];
  for(const s of shapes){
    if(!isShapeVisible(s) || excludeIds?.has(s.id)) continue;
    if(s.type==="line"){
      lines.push({...s,sourceId:s.id});
    }else if(s.type==="rect"){
      const r=rectNorm(s);
      lines.push(
        {x1:r.x1,y1:r.y1,x2:r.x2,y2:r.y1,sourceId:s.id},
        {x1:r.x2,y1:r.y1,x2:r.x2,y2:r.y2,sourceId:s.id},
        {x1:r.x2,y1:r.y2,x2:r.x1,y2:r.y2,sourceId:s.id},
        {x1:r.x1,y1:r.y2,x2:r.x1,y2:r.y1,sourceId:s.id}
      );
    }else if(s.type==="circle" || s.type==="hole"){
      circles.push({cx:s.cx,cy:s.cy,r:s.r,sourceId:s.id});
    }else if(s.type==="arc"){
      arcs.push({cx:s.cx,cy:s.cy,r:s.r,a1:s.a1,a2:s.a2,sourceId:s.id});
    }
  }
  return {lines,circles,arcs};
}

function segmentCircleIntersections(line,circle){
  const dx=line.x2-line.x1,dy=line.y2-line.y1;
  const fx=line.x1-circle.cx,fy=line.y1-circle.cy;
  const a=dx*dx+dy*dy;
  if(a<EPS) return [];
  const b=2*(fx*dx+fy*dy);
  const c=fx*fx+fy*fy-circle.r*circle.r;
  const disc=b*b-4*a*c;
  if(disc<-EPS) return [];
  const root=Math.sqrt(Math.max(0,disc));
  const ts=[(-b-root)/(2*a),(-b+root)/(2*a)];
  const pts=[];
  for(const t of ts){
    if(t>=-1e-7&&t<=1+1e-7){
      const p={x:line.x1+t*dx,y:line.y1+t*dy};
      if(!pts.some(q=>Math.hypot(q.x-p.x,q.y-p.y)<1e-7)) pts.push(p);
    }
  }
  return pts;
}

function circleCircleIntersections(a,b){
  const dx=b.cx-a.cx,dy=b.cy-a.cy,d=Math.hypot(dx,dy);
  if(d<EPS || d>a.r+b.r+1e-7 || d<Math.abs(a.r-b.r)-1e-7) return [];
  const x=(a.r*a.r-b.r*b.r+d*d)/(2*d);
  const h2=a.r*a.r-x*x;
  if(h2<-EPS) return [];
  const h=Math.sqrt(Math.max(0,h2));
  const ux=dx/d,uy=dy/d;
  const px=a.cx+x*ux,py=a.cy+x*uy;
  const p1={x:px-h*uy,y:py+h*ux};
  const p2={x:px+h*uy,y:py-h*ux};
  return Math.hypot(p1.x-p2.x,p1.y-p2.y)<1e-7?[p1]:[p1,p2];
}

function onArcPoint(p,arc){
  return angleOnArc(angleOf(arc.cx,arc.cy,p),arc.a1,arc.a2);
}

function pushUniquePoint(list,p,kind="交点"){
  if(!list.some(q=>Math.hypot(q.x-p.x,q.y-p.y)<1e-7)) list.push({...p,kind});
}

function dimensionIntersectionCandidates(excludeIds=null){
  const {lines,circles,arcs}=dimensionPrimitives(excludeIds);
  const pts=[];

  for(let i=0;i<lines.length;i++){
    for(let j=i+1;j<lines.length;j++){
      if(lines[i].sourceId===lines[j].sourceId) continue;
      const p=lineIntersection(lines[i],lines[j]);
      if(p) pushUniquePoint(pts,p);
    }
  }

  for(const line of lines){
    for(const circle of circles){
      if(line.sourceId===circle.sourceId) continue;
      segmentCircleIntersections(line,circle).forEach(p=>pushUniquePoint(pts,p));
    }
    for(const arc of arcs){
      if(line.sourceId===arc.sourceId) continue;
      segmentCircleIntersections(line,arc).filter(p=>onArcPoint(p,arc)).forEach(p=>pushUniquePoint(pts,p));
    }
  }

  for(let i=0;i<circles.length;i++){
    for(let j=i+1;j<circles.length;j++){
      if(circles[i].sourceId===circles[j].sourceId) continue;
      circleCircleIntersections(circles[i],circles[j]).forEach(p=>pushUniquePoint(pts,p));
    }
    for(const arc of arcs){
      if(circles[i].sourceId===arc.sourceId) continue;
      circleCircleIntersections(circles[i],arc).filter(p=>onArcPoint(p,arc)).forEach(p=>pushUniquePoint(pts,p));
    }
  }

  for(let i=0;i<arcs.length;i++){
    for(let j=i+1;j<arcs.length;j++){
      if(arcs[i].sourceId===arcs[j].sourceId) continue;
      circleCircleIntersections(arcs[i],arcs[j])
        .filter(p=>onArcPoint(p,arcs[i])&&onArcPoint(p,arcs[j]))
        .forEach(p=>pushUniquePoint(pts,p));
    }
  }
  return pts;
}

function findDimensionSnap(p,maxPx=22){
  const tol=maxPx/scale;
  const candidates=[...dimensionEndpointCandidates(),...dimensionIntersectionCandidates()];
  let best=null,bestD=Infinity;
  for(const c of candidates){
    const d=Math.hypot(p.x-c.x,p.y-c.y);
    if(d<=tol && d<bestD){best=c;bestD=d}
  }
  return best;
}

function transformSnapCandidates(excludeIds=null){
  const pts=[];
  const add=(p,kind)=>pushUniquePoint(pts,{x:p.x,y:p.y},kind);
  for(const s of shapes){
    if(!isShapeVisible(s) || s.type==="dim" || excludeIds?.has(s.id)) continue;
    if(s.type==="point"){
      add({x:s.x,y:s.y},"点");
    }else if(s.type==="line"){
      add({x:s.x1,y:s.y1},"端点");
      add({x:s.x2,y:s.y2},"端点");
      add({x:(s.x1+s.x2)/2,y:(s.y1+s.y2)/2},"中点");
    }else if(s.type==="rect"){
      const r=rectNorm(s);
      add({x:r.x1,y:r.y1},"端点");add({x:r.x2,y:r.y1},"端点");
      add({x:r.x2,y:r.y2},"端点");add({x:r.x1,y:r.y2},"端点");
      add({x:(r.x1+r.x2)/2,y:r.y1},"中点");
      add({x:r.x2,y:(r.y1+r.y2)/2},"中点");
      add({x:(r.x1+r.x2)/2,y:r.y2},"中点");
      add({x:r.x1,y:(r.y1+r.y2)/2},"中点");
      add({x:(r.x1+r.x2)/2,y:(r.y1+r.y2)/2},"中心");
    }else if(s.type==="circle" || s.type==="hole"){
      add({x:s.cx,y:s.cy},"中心");
      add({x:s.cx+s.r,y:s.cy},"円の頂点");
      add({x:s.cx-s.r,y:s.cy},"円の頂点");
      add({x:s.cx,y:s.cy+s.r},"円の頂点");
      add({x:s.cx,y:s.cy-s.r},"円の頂点");
    }else if(s.type==="arc"){
      const mid=normDeg(s.a1+ccwSpan(s.a1,s.a2)/2);
      add({x:s.cx,y:s.cy},"中心");
      add({x:s.cx+s.r*Math.cos(rad(s.a1)),y:s.cy+s.r*Math.sin(rad(s.a1))},"端点");
      add({x:s.cx+s.r*Math.cos(rad(s.a2)),y:s.cy+s.r*Math.sin(rad(s.a2))},"端点");
      add({x:s.cx+s.r*Math.cos(rad(mid)),y:s.cy+s.r*Math.sin(rad(mid))},"中点");
    }else if(s.type==="slot"){
      const hs=Math.max(0,(s.length-s.width)/2);
      add({x:s.cx,y:s.cy},"中心");
      add({x:s.cx-hs,y:s.cy},"中点");
      add({x:s.cx+hs,y:s.cy},"中点");
    }
  }
  for(const p of dimensionIntersectionCandidates(excludeIds)) add(p,"交点");
  return pts;
}

function findTransformSnap(p,maxPx=24,excludeIds=null){
  const tol=maxPx/scale;
  let best=null,bestD=Infinity;
  for(const c of transformSnapCandidates(excludeIds)){
    const d=Math.hypot(p.x-c.x,p.y-c.y);
    if(d<=tol && d<bestD){best=c;bestD=d}
  }
  return best;
}

function transformToolNeedsSnap(){
  if(tool==="copy") return opState?.stage==="copyBase" || opState?.stage==="copyTarget";
  if(tool==="mirror") return opState?.stage==="axis1" || opState?.stage==="axis2";
  if(tool==="rotate") return opState?.stage==="center";
  return false;
}

function findPointPlacementSnap(p,maxPx=24){
  const tol=maxPx/scale;
  let best=null,bestD=Infinity;
  for(const c of transformSnapCandidates()){
    if(c.kind==="点") continue;
    const d=Math.hypot(p.x-c.x,p.y-c.y);
    if(d<=tol && d<bestD){best=c;bestD=d}
  }
  return best;
}

function handlePointTap(p){
  const snap=findPointPlacementSnap(p);
  if(!snap){
    hint.textContent="端点・中点・中心・交点・円の頂点にだけ点を打てます";
    dimSnapHover=null;draw();return;
  }
  const exists=shapes.some(s=>s.type==="point"&&Math.hypot(s.x-snap.x,s.y-snap.y)<1e-7);
  if(exists){
    hint.textContent="この位置にはすでに点があります";
    return;
  }
  const s={id:newId(),type:"point",x:snap.x,y:snap.y,layer:currentLayer()};
  shapes.push(s);selectedId=s.id;dimSnapHover={x:snap.x,y:snap.y};
  snapshot();hint.textContent=snap.kind+"に点を作成しました";draw();
}

function handleDimensionTap(p){
  if(!dimDraft){
    const snap=findDimensionSnap(p);
    if(!snap){hint.textContent="端点・交点・円の頂点をタップしてください";dimSnapHover=null;draw();return;}
    dimDraft={stage:1,a:{x:snap.x,y:snap.y}};
    dimSnapHover={x:snap.x,y:snap.y};
    preview=null;hint.textContent=snap.kind+"を取得。寸法の終点をタップ";draw();return;
  }
  if(dimDraft.stage===1){
    const snap=findDimensionSnap(p);
    if(!snap){hint.textContent="終点は端点・交点・円の頂点を選んでください";dimSnapHover=null;draw();return;}
    if(Math.hypot(snap.x-dimDraft.a.x,snap.y-dimDraft.a.y)<1e-7){
      hint.textContent="始点とは別の端点・交点を選んでください";return;
    }
    dimDraft.b={x:snap.x,y:snap.y};dimDraft.stage=2;dimSnapHover=null;
    hint.textContent=snap.kind+"を取得。寸法を置く位置をタップ";draw();return;
  }
  const s={id:newId(),type:"dim",x1:dimDraft.a.x,y1:dimDraft.a.y,x2:dimDraft.b.x,y2:dimDraft.b.y,
    tx:p.x,ty:p.y,mode:qs("dimensionModeSelect")?.value==="vertical"?"vertical":"horizontal",layer:currentLayer()};
  shapes.push(s);selectedId=s.id;snapshot();dimDraft=null;dimSnapHover=null;preview=null;
  hint.textContent="寸法線を作成しました";draw();
}

function updateMoveModeUI(){
  qs("moveOriginalBtn")?.classList.toggle("active",multiMoveMode==="move");
  qs("moveCopyBtn")?.classList.toggle("active",multiMoveMode==="copy");
  qs("createByValueBtn").textContent=multiMoveMode==="copy"?"コピーして移動":"元図形を移動";
}
function openMultiPanel(){
  qs("quickTitle").textContent="図形を移動";
  quickFields.innerHTML=
    '<div class="multi-count">移動する図形: '+selectedIds.size+'個</div>'+
    '<div class="field-note"><strong>ドラッグ移動対応</strong><br>図形を選択 → 青い基準点（端点・中点・中心・交点）をつかんでそのままドラッグ</div>'+
    '<div class="transform-mode-choice">'+
      '<button id="moveOriginalBtn" class="transform-mode-btn" type="button">↔<span>元図形を移動</span></button>'+
      '<button id="moveCopyBtn" class="transform-mode-btn" type="button">⧉<span>コピーして移動</span></button>'+
    '</div>'+
    field("qMultiDX","X移動",0)+field("qMultiDY","Y移動",0)+
    '<button id="multiDeleteBtn" class="danger" type="button">選択を削除</button>';
  qs("createByValueBtn").hidden=false;
  quickPanel.classList.remove("hidden");
  updateMoveModeUI();
  qs("moveOriginalBtn")?.addEventListener("click",()=>{multiMoveMode="move";updateMoveModeUI()});
  qs("moveCopyBtn")?.addEventListener("click",()=>{multiMoveMode="copy";updateMoveModeUI()});
  qs("multiDeleteBtn").addEventListener("click",deleteMultiSelected);
  enableDirectNumberEntry(quickPanel);
}
function handleMultiTap(p){
  const s=hitTest(p);
  if(!s){hint.textContent="図形をタップして追加/解除";return;}
  if(selectedIds.has(s.id)) selectedIds.delete(s.id); else selectedIds.add(s.id);
  selectedId=null;openMultiPanel();
  hint.textContent="選択中: "+selectedIds.size+"個";draw();
}
function applyMultiMove(){
  if(!selectedIds.size)return;
  const dx=num(qs("qMultiDX")?.value),dy=num(qs("qMultiDY")?.value);
  const targets=shapes.filter(s=>selectedIds.has(s.id));
  const count=targets.length;
  if(multiMoveMode==="copy"){
    const copies=targets.map(source=>{
      const s=JSON.parse(JSON.stringify(source));
      s.id=newId();translateShape(s,dx,dy);return s;
    });
    shapes.push(...copies);
    selectedIds=new Set(copies.map(s=>s.id));
    snapshot();openMultiPanel();hint.textContent=count+"個をコピーして移動しました";draw();return;
  }
  targets.forEach(s=>translateShape(s,dx,dy));
  snapshot();openMultiPanel();hint.textContent=count+"個の元図形を移動しました";draw();
}
function deleteMultiSelected(){
  if(!selectedIds.size)return;
  const count=selectedIds.size;
  shapes=shapes.filter(s=>!selectedIds.has(s.id));
  selectedIds.clear();snapshot();openMultiPanel();hint.textContent=count+"個を削除しました";draw();
}

function handleArcTap(p){
  if(!arcDraft){
    arcDraft={stage:1,c:p}; preview=null; hint.textContent="円弧の始点をタップ"; return;
  }
  if(arcDraft.stage===1){
    arcDraft.r=Math.max(.1,Math.hypot(p.x-arcDraft.c.x,p.y-arcDraft.c.y));
    arcDraft.a1=angleOf(arcDraft.c.x,arcDraft.c.y,p);
    arcDraft.stage=2; hint.textContent="円弧の終点をタップ"; return;
  }
  const s={id:newId(),type:"arc",cx:arcDraft.c.x,cy:arcDraft.c.y,r:arcDraft.r,
    a1:arcDraft.a1,a2:angleOf(arcDraft.c.x,arcDraft.c.y,p),layer:currentLayer()};
  shapes.push(s); selectedId=s.id; snapshot();
  arcDraft=null; preview=null; hint.textContent="円弧を作成しました"; draw();
}

function lineIntersection(a,b){
  const x1=a.x1,y1=a.y1,x2=a.x2,y2=a.y2,x3=b.x1,y3=b.y1,x4=b.x2,y4=b.y2;
  const den=(x1-x2)*(y3-y4)-(y1-y2)*(x3-x4);
  if(Math.abs(den)<EPS) return null;
  const px=((x1*y2-y1*x2)*(x3-x4)-(x1-x2)*(x3*y4-y3*x4))/den;
  const py=((x1*y2-y1*x2)*(y3-y4)-(y1-y2)*(x3*y4-y3*x4))/den;
  const within=(v,a1,a2)=>v>=Math.min(a1,a2)-1e-6&&v<=Math.max(a1,a2)+1e-6;
  if(!within(px,x1,x2)||!within(py,y1,y2)||!within(px,x3,x4)||!within(py,y3,y4)) return null;
  return {x:px,y:py};
}

function handleTrimTap(p){
  if(!opState){
    const target=hitTest(p,s=>s.type==="line");
    if(!target){ hint.textContent="トリムする直線をタップ"; return; }
    opState={targetId:target.id,click:p}; selectedId=target.id;
    hint.textContent="境界になる直線をタップ"; draw(); return;
  }
  const target=shapes.find(s=>s.id===opState.targetId);
  const cutter=hitTest(p,s=>s.type==="line"&&s.id!==opState.targetId);
  if(!target||!cutter){ hint.textContent="別の直線を境界としてタップ"; return; }
  const ip=lineIntersection(target,cutter);
  if(!ip){ hint.textContent="2本の線が交差していません"; opState=null; selectedId=null; draw(); return; }
  const d1=Math.hypot(opState.click.x-target.x1,opState.click.y-target.y1);
  const d2=Math.hypot(opState.click.x-target.x2,opState.click.y-target.y2);
  if(d1<d2){target.x1=ip.x;target.y1=ip.y}else{target.x2=ip.x;target.y2=ip.y}
  snapshot(); opState=null; selectedId=target.id; hint.textContent="トリムしました"; draw();
}

function handleParallelTap(p){
  const source=hitTest(p,s=>s.type==="line");
  if(!source){
    hint.textContent="平行線の元になる直線をタップしてください";
    return;
  }
  selectedId=source.id;
  opState={sourceId:source.id};
  qs("quickTitle").textContent="平行線";
  quickFields.innerHTML=
    field("qParallelDistance","元の線から ± mm",5);
  qs("createByValueBtn").textContent="平行線を作成";
  quickPanel.classList.remove("hidden");
  enableDirectNumberEntry(quickPanel);
  hint.textContent="元の線からの距離を＋/−mmで入力";
  draw();
}

function applyParallel(){
  const source=shapes.find(s=>s.id===opState?.sourceId && s.type==="line");
  if(!source) return;
  const d=num(qs("qParallelDistance")?.value);
  const dx=source.x2-source.x1,dy=source.y2-source.y1,len=Math.hypot(dx,dy);
  if(len<EPS){
    hint.textContent="長さ0の直線には平行線を作れません";
    return;
  }
  const nx=-dy/len,ny=dx/len;
  const s={
    ...JSON.parse(JSON.stringify(source)),
    id:newId(),
    x1:source.x1+nx*d,
    y1:source.y1+ny*d,
    x2:source.x2+nx*d,
    y2:source.y2+ny*d
  };
  shapes.push(s);
  selectedId=s.id;
  snapshot();
  opState=null;
  quickPanel.classList.add("hidden");
  qs("createByValueBtn").textContent="この寸法で作成";
  hint.textContent="平行線を作成しました";
  draw();
}

function handleOffsetTap(p){
  const source=hitTest(p,s=>["line","rect","circle","hole","slot","arc"].includes(s.type));
  if(!source){ hint.textContent="オフセット元の図形をタップ"; return; }
  selectedId=source.id; opState={sourceId:source.id};
  qs("quickTitle").textContent="オフセット";
  quickFields.innerHTML=field("qOffset","距離（±で方向）",5);
  qs("createByValueBtn").textContent="オフセット作成";
  quickPanel.classList.remove("hidden");
  hint.textContent="距離を入力してください"; draw();
}

function applyOffset(){
  const source=shapes.find(s=>s.id===opState?.sourceId);
  if(!source) return;
  const d=num(qs("qOffset")?.value);
  const s=JSON.parse(JSON.stringify(source)); s.id=newId();

  if(s.type==="line"){
    const dx=s.x2-s.x1,dy=s.y2-s.y1,len=Math.hypot(dx,dy);
    if(len<EPS) return;
    const nx=-dy/len,ny=dx/len;
    s.x1+=nx*d;s.y1+=ny*d;s.x2+=nx*d;s.y2+=ny*d;
  }else if(s.type==="rect"){
    const r=rectNorm(s);
    s.x=r.x1-d;s.y=r.y1-d;s.w=r.w+2*d;s.h=r.h+2*d;
    if(s.w<=0||s.h<=0){alert("オフセット距離が大きすぎます");return;}
  }else if(s.type==="circle"||s.type==="hole"||s.type==="arc"){
    s.r+=d;if(s.r<=0){alert("半径が0以下になります");return;}
  }else if(s.type==="slot"){
    s.length+=2*d;s.width+=2*d;
    if(s.width<=0||s.length<s.width){alert("オフセット距離が大きすぎます");return;}
  }
  shapes.push(s);selectedId=s.id;snapshot();opState=null;quickPanel.classList.add("hidden");
  qs("createByValueBtn").textContent="この寸法で作成";
  hint.textContent="オフセットを作成しました";draw();
}

function nearestRectCorner(s,p){
  const r=rectNorm(s);
  const pts={bl:{x:r.x1,y:r.y1},br:{x:r.x2,y:r.y1},tr:{x:r.x2,y:r.y2},tl:{x:r.x1,y:r.y2}};
  return Object.entries(pts).sort((a,b)=>
    Math.hypot(p.x-a[1].x,p.y-a[1].y)-Math.hypot(p.x-b[1].x,p.y-b[1].y)
  )[0][0];
}

function handleCornerTap(p){
  const rect=hitTest(p,s=>s.type==="rect");
  if(!rect){ hint.textContent=(tool==="chamfer"?"面取り":"R")+"を付ける四角の角をタップ"; return; }
  const corner=nearestRectCorner(rect,p);
  selectedId=rect.id;opState={sourceId:rect.id,corner,kind:tool};
  qs("quickTitle").textContent=tool==="chamfer"?"面取り（C）":"角R";
  quickFields.innerHTML=field("qCornerValue",tool==="chamfer"?"C寸法":"R寸法",5);
  qs("createByValueBtn").textContent=tool==="chamfer"?"面取りを適用":"Rを適用";
  quickPanel.classList.remove("hidden");
  hint.textContent=corner.toUpperCase()+"角を選択中";draw();
}

function applyCornerMod(){
  const s=shapes.find(x=>x.id===opState?.sourceId);
  if(!s||s.type!=="rect") return;
  const v=Math.abs(num(qs("qCornerValue")?.value)), max=maxCornerValue(s);
  if(v<=0||v>max){alert("最大値は "+round(max)+" mm です");return;}
  s.corners=s.corners||{};
  s.corners[opState.corner]={type:opState.kind,value:v};
  snapshot();quickPanel.classList.add("hidden");
  qs("createByValueBtn").textContent="この寸法で作成";
  hint.textContent=opState.kind==="chamfer"?"面取りを適用しました":"Rを適用しました";
  opState=null;draw();
}


function finishTransform(message){
  opState=null;dimSnapHover=null;quickPanel.classList.add("hidden");
  qs("createByValueBtn").hidden=false;
  qs("createByValueBtn").textContent="この寸法で作成";
  hint.textContent=message;draw();
}

function handleCopyTap(p){
  if(!opState?.sourceId){
    const source=hitTest(p,s=>s.type!=="dim");
    if(!source){hint.textContent="コピーする図形をタップ";return;}
    selectedId=source.id;opState={sourceId:source.id,stage:"numeric"};
    qs("quickTitle").textContent="コピー";
    quickFields.innerHTML=
      field("qDX","X方向",10)+field("qDY","Y方向",0)+
      '<button id="copyPointModeBtn" class="point-mode-btn" type="button">◎ 点から点へコピー</button>';
    qs("createByValueBtn").textContent="移動量でコピー";
    quickPanel.classList.remove("hidden");
    enableDirectNumberEntry(quickPanel);
    qs("copyPointModeBtn")?.addEventListener("click",()=>{
      opState.stage="copyBase";
      quickPanel.classList.add("hidden");
      dimSnapHover=null;
      hint.textContent="コピー元の基準点をタップ（端点・中点・中心・交点）";
      draw();
    });
    hint.textContent="移動量を入力、または点から点へコピー";draw();return;
  }
  if(opState.stage==="copyBase"){
    const snap=findTransformSnap(p);
    if(!snap){hint.textContent="端点・中点・中心・交点を選んでください";return;}
    opState.base={x:snap.x,y:snap.y};opState.stage="copyTarget";
    dimSnapHover={x:snap.x,y:snap.y};
    hint.textContent=snap.kind+"を基準にしました。移動先の点をタップ";draw();return;
  }
  if(opState.stage==="copyTarget"){
    const snap=findTransformSnap(p);
    if(!snap){hint.textContent="移動先の端点・中点・中心・交点を選んでください";return;}
    const source=shapes.find(s=>s.id===opState.sourceId);if(!source)return;
    const s=JSON.parse(JSON.stringify(source));s.id=newId();
    translateShape(s,snap.x-opState.base.x,snap.y-opState.base.y);
    shapes.push(s);selectedId=s.id;snapshot();
    finishTransform("点から点へコピーしました");return;
  }
  hint.textContent="移動量を入力、または「点から点へコピー」を選択";
}

function showTransformModeChoice(kind){
  const isRotate=kind==="rotate";
  qs("quickTitle").textContent=isRotate?"回転方法":"ミラー方法";
  quickFields.innerHTML=
    '<div class="field-note transform-point-note">'+(isRotate?"回転させる方法を選択":"ミラーする方法を選択")+'</div>'+
    '<div class="transform-mode-choice">'+
      '<button id="transformOriginalBtn" class="transform-mode-btn" type="button">↔<span>元図形</span></button>'+
      '<button id="transformCopyBtn" class="transform-mode-btn" type="button">⧉<span>複写（コピー）</span></button>'+
    '</div>';
  qs("createByValueBtn").hidden=true;
  quickPanel.classList.remove("hidden");
  qs("transformOriginalBtn")?.addEventListener("click",()=>chooseTransformMode("move"));
  qs("transformCopyBtn")?.addEventListener("click",()=>chooseTransformMode("copy"));
}

function chooseTransformMode(mode){
  if(!opState) return;
  opState.mode=mode==="copy"?"copy":"move";
  qs("createByValueBtn").hidden=false;
  quickPanel.classList.add("hidden");
  dimSnapHover=null;
  if(tool==="rotate"){
    opState.stage="center";
    hint.textContent=(opState.mode==="copy"?"コピーを回転：":"元図形を回転：")+"回転中心をタップ（端点・中点・中心・交点）";
  }else if(tool==="mirror"){
    opState.stage="axis1";
    hint.textContent=(opState.mode==="copy"?"ミラーコピー：":"元図形をミラー：")+"軸の1点目をタップ";
  }
  draw();
}

function handleRotateTap(p){
  if(!opState?.sourceId){
    const source=hitTest(p,s=>s.type!=="dim");
    if(!source){hint.textContent="回転する図形をタップ";return;}
    selectedId=source.id;opState={sourceId:source.id,stage:"mode",mode:null};
    dimSnapHover=null;showTransformModeChoice("rotate");
    hint.textContent="元図形を回転するか、コピーを回転するか選択";draw();return;
  }
  if(opState.stage==="mode"){hint.textContent="回転方法を選択してください";return;}
  if(opState.stage==="center"){
    const snap=findTransformSnap(p);
    if(!snap){hint.textContent="回転中心は端点・中点・中心・交点から選んでください";return;}
    opState.center={x:snap.x,y:snap.y};opState.stage="angle";
    dimSnapHover={x:snap.x,y:snap.y};
    qs("quickTitle").textContent="回転";
    quickFields.innerHTML=
      '<div class="field-note transform-point-note">回転中心：'+snap.kind+' ('+round(snap.x)+', '+round(snap.y)+')</div>'+
      field("qRotateAngle","回転角度 °",90);
    qs("createByValueBtn").textContent="この中心で回転";
    quickPanel.classList.remove("hidden");
    enableDirectNumberEntry(quickPanel);
    hint.textContent=snap.kind+"を回転中心に設定。角度を入力";draw();return;
  }
  hint.textContent="角度を入力して回転してください";
}

function rotatePoint(p,c,a){
  const ca=Math.cos(a),sa=Math.sin(a),dx=p.x-c.x,dy=p.y-c.y;
  return {x:c.x+dx*ca-dy*sa,y:c.y+dx*sa+dy*ca};
}

function applyRotate(){
  const source=shapes.find(s=>s.id===opState?.sourceId);if(!source)return;
  const mode=opState?.mode==="copy"?"copy":"move";
  const s=JSON.parse(JSON.stringify(source));
  const c=opState?.center;if(!c){hint.textContent="回転中心を選んでください";return;}
  const a=rad(num(qs("qRotateAngle")?.value));
  if(s.type==="line"){
    let p=rotatePoint({x:s.x1,y:s.y1},c,a),q=rotatePoint({x:s.x2,y:s.y2},c,a);
    s.x1=p.x;s.y1=p.y;s.x2=q.x;s.y2=q.y;
  }else if(s.type==="circle"||s.type==="hole"||s.type==="slot"){
    const p=rotatePoint({x:s.cx,y:s.cy},c,a);s.cx=p.x;s.cy=p.y;
  }else if(s.type==="arc"){
    const p=rotatePoint({x:s.cx,y:s.cy},c,a);s.cx=p.x;s.cy=p.y;s.a1=normDeg(s.a1+deg(a));s.a2=normDeg(s.a2+deg(a));
  }else if(s.type==="rect"){
    const angleDeg=num(qs("qRotateAngle")?.value);
    const q=Math.round(angleDeg/90);
    if(Math.abs(angleDeg-q*90)>1e-6){alert("四角形は現在90°単位の回転に対応しています");return;}
    const r=rectNorm(s),center={x:(r.x1+r.x2)/2,y:(r.y1+r.y2)/2};
    const rc=rotatePoint(center,c,rad(q*90));
    const odd=Math.abs(q)%2===1;
    s.w=odd?r.h:r.w;s.h=odd?r.w:r.h;
    s.x=rc.x-s.w/2;s.y=rc.y-s.h/2;
    const old=s.corners||{};
    const maps=[
      {tl:"tl",tr:"tr",br:"br",bl:"bl"},
      {tl:"bl",tr:"tl",br:"tr",bl:"br"},
      {tl:"br",tr:"bl",br:"tl",bl:"tr"},
      {tl:"tr",tr:"br",br:"bl",bl:"tl"}
    ];
    const m=maps[((q%4)+4)%4];
    s.corners={tl:old[m.tl],tr:old[m.tr],br:old[m.br],bl:old[m.bl]};
  }
  if(mode==="copy"){
    s.id=newId();shapes.push(s);selectedId=s.id;
  }else{
    s.id=source.id;Object.assign(source,s);selectedId=source.id;
  }
  snapshot();
  finishTransform(mode==="copy"?"回転コピーしました":"元図形を回転しました");
}

function handleMirrorTap(p){
  if(!opState?.sourceId){
    const source=hitTest(p,s=>s.type!=="dim");
    if(!source){hint.textContent="ミラーする図形をタップ";return;}
    selectedId=source.id;opState={sourceId:source.id,stage:"mode",mode:null};
    dimSnapHover=null;showTransformModeChoice("mirror");
    hint.textContent="元図形をミラーするか、コピーを作るか選択";draw();return;
  }
  if(opState.stage==="mode"){hint.textContent="ミラー方法を選択してください";return;}
  if(opState.stage==="axis1"){
    const snap=findTransformSnap(p);
    if(!snap){hint.textContent="軸の1点目は端点・中点・中心・交点から選んでください";return;}
    opState.axis1={x:snap.x,y:snap.y};opState.stage="axis2";
    dimSnapHover={x:snap.x,y:snap.y};
    hint.textContent=snap.kind+"を取得。ミラー軸の2点目をタップ";draw();return;
  }
  if(opState.stage==="axis2"){
    const snap=findTransformSnap(p);
    if(!snap){hint.textContent="軸の2点目は端点・中点・中心・交点から選んでください";return;}
    if(Math.hypot(snap.x-opState.axis1.x,snap.y-opState.axis1.y)<1e-7){
      hint.textContent="1点目とは別の点を選んでください";return;
    }
    applyMirrorByAxis(opState.axis1,{x:snap.x,y:snap.y});return;
  }
}

function swapCornersForMirror(s,axis){
  if(s.type!=="rect"||!s.corners)return;
  const c=s.corners;
  s.corners=axis==="Y"
    ? {tl:c.tr,tr:c.tl,bl:c.br,br:c.bl}
    : {tl:c.bl,bl:c.tl,tr:c.br,br:c.tr};
}

function applyCopy(){
  const source=shapes.find(s=>s.id===opState?.sourceId);if(!source)return;
  const s=JSON.parse(JSON.stringify(source));s.id=newId();
  translateShape(s,num(qs("qDX")?.value),num(qs("qDY")?.value));
  shapes.push(s);selectedId=s.id;snapshot();
  finishTransform("コピーしました");
}

function reflectPointAcrossLine(p,a,b){
  const dx=b.x-a.x,dy=b.y-a.y,len2=dx*dx+dy*dy;
  if(len2<EPS) return {...p};
  const t=((p.x-a.x)*dx+(p.y-a.y)*dy)/len2;
  const q={x:a.x+t*dx,y:a.y+t*dy};
  return {x:2*q.x-p.x,y:2*q.y-p.y};
}

function applyMirrorByAxis(a,b){
  const source=shapes.find(s=>s.id===opState?.sourceId);if(!source)return;
  const mode=opState?.mode==="copy"?"copy":"move";
  const s=JSON.parse(JSON.stringify(source));
  const dx=b.x-a.x,dy=b.y-a.y;
  const horizontal=Math.abs(dy)<1e-7;
  const vertical=Math.abs(dx)<1e-7;

  if(s.type==="line"){
    const p=reflectPointAcrossLine({x:s.x1,y:s.y1},a,b);
    const q=reflectPointAcrossLine({x:s.x2,y:s.y2},a,b);
    s.x1=p.x;s.y1=p.y;s.x2=q.x;s.y2=q.y;
  }else if(s.type==="circle"||s.type==="hole"){
    const p=reflectPointAcrossLine({x:s.cx,y:s.cy},a,b);s.cx=p.x;s.cy=p.y;
  }else if(s.type==="arc"){
    const p1={x:s.cx+s.r*Math.cos(rad(s.a1)),y:s.cy+s.r*Math.sin(rad(s.a1))};
    const p2={x:s.cx+s.r*Math.cos(rad(s.a2)),y:s.cy+s.r*Math.sin(rad(s.a2))};
    const c=reflectPointAcrossLine({x:s.cx,y:s.cy},a,b);
    const r1=reflectPointAcrossLine(p1,a,b),r2=reflectPointAcrossLine(p2,a,b);
    s.cx=c.x;s.cy=c.y;
    s.a1=angleOf(s.cx,s.cy,r2);s.a2=angleOf(s.cx,s.cy,r1);
  }else if(s.type==="rect"){
    if(!horizontal&&!vertical){alert("既存の四角形は斜め軸ミラーには未対応です");return;}
    const r=rectNorm(s);
    if(vertical){s.x=2*a.x-r.x2;s.y=r.y1;s.w=r.w;s.h=r.h;swapCornersForMirror(s,"Y")}
    else{s.x=r.x1;s.y=2*a.y-r.y2;s.w=r.w;s.h=r.h;swapCornersForMirror(s,"X")}
  }else if(s.type==="slot"){
    if(!horizontal&&!vertical){alert("長穴の斜め軸ミラーは次の拡張で対応します");return;}
    const c=reflectPointAcrossLine({x:s.cx,y:s.cy},a,b);s.cx=c.x;s.cy=c.y;
  }else{
    return;
  }
  if(mode==="copy"){
    s.id=newId();shapes.push(s);selectedId=s.id;
  }else{
    s.id=source.id;Object.assign(source,s);selectedId=source.id;
  }
  snapshot();
  finishTransform(mode==="copy"?"ミラーコピーしました":"元図形をミラーしました");
}

function applyMirror(){
  hint.textContent="ミラー軸を図形上の2点で選んでください";
}


function field(name,label,value=0,step="any"){
  return `<div class="field"><label for="${name}">${label}</label><input id="${name}" type="number" inputmode="decimal" enterkeyhint="done" autocomplete="off" step="${step}" value="${round(num(value))}"></div>`;
}

function enableDirectNumberEntry(root=document){
  root.querySelectorAll?.('input[type="number"]').forEach(input=>{
    if(input.dataset.directEntry==="1") return;
    input.dataset.directEntry="1";

    const prepareEntry=()=>{
      if(input.value!=="" && Number(input.value)===0){
        input.dataset.zeroCleared="1";
        input.value="";
        return;
      }
      requestAnimationFrame(()=>{
        try{input.select()}catch{}
      });
    };

    input.addEventListener("focus",prepareEntry);
    input.addEventListener("click",prepareEntry);
    input.addEventListener("touchend",prepareEntry,{passive:true});
    input.addEventListener("blur",()=>{
      if(input.value.trim()==="" && input.dataset.zeroCleared==="1"){
        input.value="0";
      }
      delete input.dataset.zeroCleared;
    });
  });
}

function openQuick(type){
  qs("quickTitle").textContent=`${shapeLabel(type)}を数値で作図`;
  if(type==="line"){
    quickFields.innerHTML=field("qX","始点 X",0)+field("qY","始点 Y",0)+field("qLength","長さ",50)+field("qAngle","角度 °",0);
  }
  if(type==="rect"){
    quickFields.innerHTML=field("qX","左下 X",0)+field("qY","左下 Y",0)+field("qW","幅",100)+field("qH","高さ",50);
  }
  if(type==="circle"){
    quickFields.innerHTML=field("qX","中心 X",0)+field("qY","中心 Y",0)+field("qD","直径 Ø",20);
  }
  if(type==="arc"){
    quickFields.innerHTML=field("qX","中心 X",0)+field("qY","中心 Y",0)+field("qR","半径 R",20)+field("qA1","開始角 °",0)+field("qA2","終了角 °",90);
  }
  if(type==="hole"){
    quickFields.innerHTML=
      '<div class="field"><label for="qHoleType">穴種</label><select id="qHoleType">'+
      '<option value="through">通し穴</option>'+
      '<option value="M3">M3タップ（並目）</option><option value="M4">M4タップ（並目）</option>'+
      '<option value="M5">M5タップ（並目）</option><option value="M6">M6タップ（並目）</option>'+
      '<option value="M8">M8タップ（並目）</option><option value="M10">M10タップ（並目）</option>'+
      '<option value="M12">M12タップ（並目）</option>'+
      '<option value="counterbore">ザグリ穴</option><option value="countersink">皿穴</option></select></div>'+
      field("qD","下穴 / 貫通 Ø",10)+
      '<div id="holeOuterField" class="field hidden-field"><label for="qOuterD">外径 Ø</label><input id="qOuterD" type="number" inputmode="decimal" step="any" value="18"></div>'+
      field("qX","中心 X",0)+field("qY","中心 Y",0)+
      '<div class="field-note">ザグリ・皿穴は上面図として同心円で表示します。外径は任意入力です。</div>';
    const tapDrill={M3:2.5,M4:3.3,M5:4.2,M6:5.0,M8:6.8,M10:8.5,M12:10.2};
    qs("qHoleType").addEventListener("change",e=>{
      const kind=e.target.value;
      if(tapDrill[kind]) qs("qD").value=tapDrill[kind];
      qs("holeOuterField").classList.toggle("hidden-field",!(kind==="counterbore"||kind==="countersink"));
    });
  }
  if(type==="slot"){
    quickFields.innerHTML=field("qX","中心 X",0)+field("qY","中心 Y",0)+field("qLength","全長",40)+field("qW","幅",10);
  }
  quickPanel.classList.remove("hidden");
  enableDirectNumberEntry(quickPanel);
}

qs("createByValueBtn").addEventListener("click",()=>{
  if(tool==="offset") return applyOffset();
  if(tool==="parallel") return applyParallel();
  if(tool==="chamfer" || tool==="fillet") return applyCornerMod();
  if(tool==="copy") return applyCopy();
  if(tool==="mirror") return applyMirror();
  if(tool==="rotate") return applyRotate();
  if(tool==="multi") return applyMultiMove();

  let s=null;
  const x=num(qs("qX")?.value),y=num(qs("qY")?.value);
  const id=newId(),layer=currentLayer();
  if(tool==="line"){
    const length=Math.abs(num(qs("qLength").value));
    const angle=num(qs("qAngle").value)*Math.PI/180;
    s={id,type:"line",x1:x,y1:y,x2:x+length*Math.cos(angle),y2:y+length*Math.sin(angle),layer};
  }
  if(tool==="rect"){
    s={id,type:"rect",x,y,w:num(qs("qW").value),h:num(qs("qH").value),corners:{},layer};
  }
  if(tool==="circle"){
    s={id,type:"circle",cx:x,cy:y,r:Math.abs(num(qs("qD").value))/2,layer};
  }
  if(tool==="arc"){
    s={id,type:"arc",cx:x,cy:y,r:Math.abs(num(qs("qR").value)),
      a1:normDeg(num(qs("qA1").value)),a2:normDeg(num(qs("qA2").value)),layer};
  }
  if(tool==="hole"){
    const holeKind=qs("qHoleType")?.value || "through";
    const outerD=(holeKind==="counterbore"||holeKind==="countersink")?Math.abs(num(qs("qOuterD")?.value)):0;
    s={id,type:"hole",cx:x,cy:y,r:Math.abs(num(qs("qD").value))/2,holeKind,counterD:outerD,layer};
  }
  if(tool==="slot"){
    const a=Math.abs(num(qs("qLength").value)),b=Math.abs(num(qs("qW").value));
    s={id,type:"slot",cx:x,cy:y,length:Math.max(a,b),width:Math.min(a,b),layer};
  }
  if(!s) return;

  if(tool==="line" && quickCreatedId===null){
    const existing=shapes
      .filter(x=>x.type==="line" && sameLineRay(x,s))
      .sort((a,b)=>lineLength(b)-lineLength(a))[0];
    if(existing) quickCreatedId=existing.id;
  }

  if(tool==="line" && quickCreatedId!==null){
    const target=shapes.find(x=>x.id===quickCreatedId && x.type==="line");
    if(target){
      const keepId=target.id;
      Object.assign(target,s,{id:keepId});
      selectedId=keepId;
      snapshot();fitView();draw();
      qs("createByValueBtn").textContent="この寸法に更新";
      hint.textContent="直線の寸法を更新しました";
      return;
    }
    quickCreatedId=null;
  }

  shapes.push(s);selectedId=s.id;
  if(tool==="line"){
    quickCreatedId=s.id;
    qs("createByValueBtn").textContent="この寸法に更新";
  }
  snapshot();fitView();draw();
  hint.textContent=`${shapeLabel(s.type)}を作成しました`;
});

function openProperty(s){
  quickPanel.classList.add("hidden");
  propertyPanel.classList.remove("hidden");
  let html=`<div class="field"><label>種類</label><input value="${shapeLabel(s.type)}" disabled></div>`;
  html+='<div class="field"><label>レイヤー</label><select id="pLayer">'+
    Array.from({length:11},(_,i)=>'<option value="'+i+'">'+i+'</option>').join('')+
    '</select></div>';
  setTimeout(()=>{if(qs("pLayer"))qs("pLayer").value=ensureLayer(s.layer)},0);
  if(s.type==="point"){
    html+=field("pX","X",s.x)+field("pY","Y",s.y);
  }
  if(s.type==="line"){
    const length=Math.hypot(s.x2-s.x1,s.y2-s.y1);
    const angle=normDeg(deg(Math.atan2(s.y2-s.y1,s.x2-s.x1)));
    html+=field("pX1","始点 X",s.x1)+field("pY1","始点 Y",s.y1)+field("pLength","長さ",length)+field("pAngle","角度 °",angle);
  }
  if(s.type==="rect"){
    html+=field("pX","左下 X",s.x)+field("pY","左下 Y",s.y)+field("pW","幅",s.w)+field("pH","高さ",s.h);
  }
  if(s.type==="circle"){
    html+=field("pCX","中心 X",s.cx)+field("pCY","中心 Y",s.cy)+field("pD","直径 Ø",s.r*2);
  }
  if(s.type==="hole"){
    const holeName=s.holeKind==="counterbore"?"ザグリ穴":s.holeKind==="countersink"?"皿穴":
      (s.holeKind && s.holeKind!=="through" ? s.holeKind+"タップ" : "通し穴");
    html+='<div class="field"><label>穴種</label><input value="'+holeName+'" disabled></div>';
    html+=field("pCX","中心 X",s.cx)+field("pCY","中心 Y",s.cy)+field("pD","穴径 Ø",s.r*2);
    if(s.counterD) html+=field("pOuterD","外径 Ø",s.counterD);
  }
  if(s.type==="slot"){
    html+=field("pCX","中心 X",s.cx)+field("pCY","中心 Y",s.cy)+field("pLength","全長",s.length)+field("pW","幅",s.width);
  }
  if(s.type==="arc"){
    html+=field("pCX","中心 X",s.cx)+field("pCY","中心 Y",s.cy)+field("pR","半径 R",s.r)+field("pA1","開始角 °",s.a1)+field("pA2","終了角 °",s.a2);
  }
  if(s.type==="dim"){
    html+=field("pX1","始点 X",s.x1)+field("pY1","始点 Y",s.y1)+field("pX2","終点 X",s.x2)+field("pY2","終点 Y",s.y2)+field("pTX","表示 X",s.tx)+field("pTY","表示 Y",s.ty);
    html+='<div class="field"><label>寸法方向</label><select id="pDimMode"><option value="horizontal">水平</option><option value="vertical">垂直</option></select></div>';
    setTimeout(()=>{if(qs("pDimMode"))qs("pDimMode").value=s.mode==="vertical"?"vertical":"horizontal"},0);
  }
  propertyFields.innerHTML=html;
  enableDirectNumberEntry(propertyPanel);
}

function closeProperty(){
  propertyPanel.classList.add("hidden");
}
qs("closePropertyBtn").addEventListener("click",()=>{selectedId=null;closeProperty();draw()});
qs("closeQuickBtn").addEventListener("click",()=>{
  opState=null;quickCreatedId=null;dimSnapHover=null;
  quickPanel.classList.add("hidden");
  qs("createByValueBtn").textContent="この寸法で作成";
});

qs("applyPropertyBtn").addEventListener("click",()=>{
  const s=selectedShape(); if(!s) return;
  if(qs("pLayer")) s.layer=ensureLayer(qs("pLayer").value.trim()||"0");
  if(s.type==="point"){
    s.x=num(qs("pX").value);s.y=num(qs("pY").value);
  }
  if(s.type==="line"){
    const x1=num(qs("pX1").value),y1=num(qs("pY1").value);
    const length=Math.abs(num(qs("pLength").value));
    const angle=rad(num(qs("pAngle").value));
    s.x1=x1;s.y1=y1;
    s.x2=x1+length*Math.cos(angle);
    s.y2=y1+length*Math.sin(angle);
  }
  if(s.type==="rect"){
    s.x=num(qs("pX").value);s.y=num(qs("pY").value);s.w=num(qs("pW").value);s.h=num(qs("pH").value);
  }
  if(s.type==="circle" || s.type==="hole"){
    s.cx=num(qs("pCX").value);s.cy=num(qs("pCY").value);s.r=Math.abs(num(qs("pD").value))/2;
    if(s.type==="hole" && qs("pOuterD")) s.counterD=Math.abs(num(qs("pOuterD").value));
  }
  if(s.type==="slot"){
    s.cx=num(qs("pCX").value);s.cy=num(qs("pCY").value);const a=Math.abs(num(qs("pLength").value)),b=Math.abs(num(qs("pW").value));s.length=Math.max(a,b);s.width=Math.min(a,b);
  }
  if(s.type==="arc"){
    s.cx=num(qs("pCX").value);s.cy=num(qs("pCY").value);s.r=Math.abs(num(qs("pR").value));
    s.a1=normDeg(num(qs("pA1").value));s.a2=normDeg(num(qs("pA2").value));
  }
  if(s.type==="dim"){
    s.x1=num(qs("pX1").value);s.y1=num(qs("pY1").value);s.x2=num(qs("pX2").value);s.y2=num(qs("pY2").value);s.tx=num(qs("pTX").value);s.ty=num(qs("pTY").value);
    s.mode=qs("pDimMode")?.value==="vertical"?"vertical":"horizontal";
  }
  snapshot();
  selectedId=null;
  closeProperty();
  draw();
  hint.textContent="寸法を更新しました";
});

function deleteCurrentSelection(){
  if(quickCreatedId!==null && (selectedId===quickCreatedId || selectedIds.has(quickCreatedId))) quickCreatedId=null;
  if(selectedIds.size){
    const count=selectedIds.size;
    shapes=shapes.filter(s=>!selectedIds.has(s.id));
    selectedIds.clear();selectedId=null;closeProperty();snapshot();draw();
    hint.textContent=count+"個を削除しました";
    if(tool==="multi") openMultiPanel();
    return;
  }
  if(selectedId!==null){
    shapes=shapes.filter(s=>s.id!==selectedId);
    selectedId=null;closeProperty();snapshot();draw();hint.textContent="削除しました";
    return;
  }
  hint.textContent="削除する図形を先に選択してください";
}
qs("deleteSelectedBtn").addEventListener("click",deleteCurrentSelection);
qs("deleteToolBtn").addEventListener("click",e=>{
  e.stopPropagation();
  const btn=qs("deleteToolBtn");
  btn.classList.add("command-flash");
  setTimeout(()=>btn.classList.remove("command-flash"),220);
  deleteCurrentSelection();
});

qs("layerBtn").addEventListener("click",()=>{
  const panel=qs("layerPanel");
  panel.classList.toggle("hidden");
  qs("layerBtn").classList.toggle("active",!panel.classList.contains("hidden"));
});
qs("closeLayerBtn").addEventListener("click",()=>{
  qs("layerPanel").classList.add("hidden");
  qs("layerBtn").classList.remove("active");
});
qs("layerVisibleBtn").addEventListener("click",()=>{
  const layer=currentLayer();
  layerVisibility[layer]=!(layerVisibility[layer]!==false);
  qs("layerVisibleBtn").textContent=layerVisibility[layer]?"👁 表示中":"🚫 非表示";
  hint.textContent=(layerVisibility[layer]?"表示: ":"非表示: ")+layer;
  draw();
});
qs("layerSelect").addEventListener("change",()=>{
  const layer=currentLayer();
  qs("layerVisibleBtn").textContent=layerVisibility[layer]===false?"🚫 非表示":"👁 表示中";
});

qs("undoBtn").addEventListener("click",()=>restoreHistory(historyIndex-1));
qs("redoBtn").addEventListener("click",()=>restoreHistory(historyIndex+1));

function getBounds(){
  if(!shapes.length) return null;
  let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
  for(const s of shapes){
    if(s.type==="line"){
      minX=Math.min(minX,s.x1,s.x2);maxX=Math.max(maxX,s.x1,s.x2);
      minY=Math.min(minY,s.y1,s.y2);maxY=Math.max(maxY,s.y1,s.y2);
    }
    if(s.type==="rect"){
      minX=Math.min(minX,s.x,s.x+s.w);maxX=Math.max(maxX,s.x,s.x+s.w);
      minY=Math.min(minY,s.y,s.y+s.h);maxY=Math.max(maxY,s.y,s.y+s.h);
    }
    if(s.type==="circle" || s.type==="hole"){
      const rr=s.type==="hole"?Math.max(s.r,(s.counterD||0)/2):s.r;
      minX=Math.min(minX,s.cx-rr);maxX=Math.max(maxX,s.cx+rr);
      minY=Math.min(minY,s.cy-rr);maxY=Math.max(maxY,s.cy+rr);
    }
    if(s.type==="slot"){
      minX=Math.min(minX,s.cx-s.length/2);maxX=Math.max(maxX,s.cx+s.length/2);
      minY=Math.min(minY,s.cy-s.width/2);maxY=Math.max(maxY,s.cy+s.width/2);
    }
    if(s.type==="dim"){
      minX=Math.min(minX,s.x1,s.x2,s.tx);maxX=Math.max(maxX,s.x1,s.x2,s.tx);
      minY=Math.min(minY,s.y1,s.y2,s.ty);maxY=Math.max(maxY,s.y1,s.y2,s.ty);
    }
    if(s.type==="arc"){
      const add=(x,y)=>{minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);};
      add(s.cx+s.r*Math.cos(rad(s.a1)),s.cy+s.r*Math.sin(rad(s.a1)));
      add(s.cx+s.r*Math.cos(rad(s.a2)),s.cy+s.r*Math.sin(rad(s.a2)));
      [0,90,180,270].forEach(a=>{
        if(angleOnArc(a,s.a1,s.a2)) add(s.cx+s.r*Math.cos(rad(a)),s.cy+s.r*Math.sin(rad(a)));
      });
    }
  }
  return {minX,minY,maxX,maxY};
}

function fitView(){
  const b=getBounds(); if(!b) return;
  const r=canvas.getBoundingClientRect();
  const w=Math.max(20,b.maxX-b.minX),h=Math.max(20,b.maxY-b.minY);
  scale=Math.max(.4,Math.min(12,Math.min((r.width-100)/w,(r.height-100)/h)));
  origin.x=r.width/2-((b.minX+b.maxX)/2)*scale;
  origin.y=r.height/2+((b.minY+b.maxY)/2)*scale;
  draw();
}
qs("fitBtn")?.addEventListener("click",fitView);
qs("zoomInBtn")?.addEventListener("click",()=>{scale=Math.min(20,scale*1.25);draw()});
qs("zoomOutBtn")?.addEventListener("click",()=>{scale=Math.max(.3,scale/1.25);draw()});

canvas.addEventListener("wheel",e=>{
  e.preventDefault();
  scale=Math.max(.3,Math.min(20,scale*(e.deltaY<0?1.1:.9)));
  draw();
},{passive:false});

qs("newBtn").addEventListener("click",()=>{
  if(!shapes.length || confirm("新しい図面を作成しますか？")){
    shapes=[];selectedId=null;nextId=1;closeProperty();snapshot();draw();
  }
});

qs("saveBtn").addEventListener("click",()=>{
  autoSave();hint.textContent="端末に保存しました";
  setTimeout(()=>hint.textContent=tool==="select"?"図形をタップして選択できます":"始点をタップ、または数値入力",1300);
});

function downloadText(name,text,type){
  const blob=new Blob([text],{type});
  const a=document.createElement("a");
  a.href=URL.createObjectURL(blob);a.download=name;a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href),1000);
}

function closeTransferMenus(){
  if(qs("loadMenu")) qs("loadMenu").open=false;
  if(qs("outputMenu")) qs("outputMenu").open=false;
}
qs("loadMenu")?.addEventListener("toggle",()=>{
  if(qs("loadMenu").open && qs("outputMenu")) qs("outputMenu").open=false;
});
qs("outputMenu")?.addEventListener("toggle",()=>{
  if(qs("outputMenu").open && qs("loadMenu")) qs("loadMenu").open=false;
});

qs("exportBtn").addEventListener("click",()=>{
  closeTransferMenus();
  openExportSavePanel("json");
});

qs("importBtn").addEventListener("click",()=>{
  closeTransferMenus();
  qs("importInput").click();
});
qs("importInput").addEventListener("change",async e=>{
  const f=e.target.files?.[0]; if(!f) return;
  try{
    const data=JSON.parse(await f.text());
    if(!Array.isArray(data.shapes)) throw new Error();
    shapes=data.shapes.map(s=>assignLayer({...s,id:s.id??newId()},"0"));
    cleanupRedundantLines();
    nextId=Math.max(1,...shapes.map(s=>num(s.id)+1));
    if(data.drawingMeta) drawingMeta={...drawingMeta,...data.drawingMeta};
    if(data.layerVisibility){
      for(let i=0;i<=10;i++){
        const k=String(i);
        if(typeof data.layerVisibility[k]==="boolean") layerVisibility[k]=data.layerVisibility[k];
      }
    }
    selectedId=null;selectedIds.clear();snapshot();fitView();hint.textContent="図面を読み込みました";
  }catch{alert("このJSONファイルは読み込めませんでした")}
  e.target.value="";
});

qs("sampleBtn").addEventListener("click",async()=>{
  try{
    const r=await fetch("./data/drawing.json",{cache:"no-store"});
    const data=await r.json();
    shapes=(data.shapes||[]).map(convertOldShape).map(s=>assignLayer({...s,id:newId()},"0"));
    selectedId=null;snapshot();fitView();hint.textContent="サンプルを読み込みました";
  }catch{hint.textContent="サンプルを読み込めませんでした"}
});

function convertOldShape(s){
  if(s.type==="line") return {type:"line",x1:num(s.x1),y1:num(s.y1),x2:num(s.x2),y2:num(s.y2)};
  if(s.type==="rect" && "w" in s) return {...s,corners:s.corners||{}};
  if(s.type==="rect") return {type:"rect",x:num(s.x1),y:num(s.y1),w:num(s.x2)-num(s.x1),h:num(s.y2)-num(s.y1)};
  if(s.type==="circle" && "r" in s) return s;
  if(s.type==="circle") return {type:"circle",cx:num(s.x1),cy:num(s.y1),r:Math.hypot(num(s.x2)-num(s.x1),num(s.y2)-num(s.y1))};
  return s;
}

function xmlEscape(v){
  return String(v??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&apos;"}[m]));
}
function exportBounds(){
  const visible=shapes.filter(isShapeVisible);
  if(!visible.length)return {minX:0,minY:0,maxX:100,maxY:50};
  let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
  const add=(x,y)=>{minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);};
  visible.forEach(s=>{
    if(s.type==="point"){add(s.x,s.y)}
    else if(s.type==="line"||s.type==="dim"){add(s.x1,s.y1);add(s.x2,s.y2);if(s.type==="dim")add(s.tx,s.ty)}
    else if(s.type==="rect"){const r=rectNorm(s);add(r.x1,r.y1);add(r.x2,r.y2)}
    else if(s.type==="circle"||s.type==="hole"){const rr=s.type==="hole"?Math.max(s.r,(s.counterD||0)/2):s.r;add(s.cx-rr,s.cy-rr);add(s.cx+rr,s.cy+rr)}
    else if(s.type==="slot"){add(s.cx-s.length/2,s.cy-s.width/2);add(s.cx+s.length/2,s.cy+s.width/2)}
    else if(s.type==="arc"){
      add(s.cx+s.r*Math.cos(rad(s.a1)),s.cy+s.r*Math.sin(rad(s.a1)));
      add(s.cx+s.r*Math.cos(rad(s.a2)),s.cy+s.r*Math.sin(rad(s.a2)));
      [0,90,180,270].forEach(a=>{if(angleOnArc(a,s.a1,s.a2))add(s.cx+s.r*Math.cos(rad(a)),s.cy+s.r*Math.sin(rad(a)))});
    }
  });
  return {minX,minY,maxX,maxY};
}
function svgPoint(x,y,b,m){return {x:x-b.minX+m,y:b.maxY-y+m};}
function svgArcPath(s,b,m){
  const p1=svgPoint(s.cx+s.r*Math.cos(rad(s.a1)),s.cy+s.r*Math.sin(rad(s.a1)),b,m);
  const p2=svgPoint(s.cx+s.r*Math.cos(rad(s.a2)),s.cy+s.r*Math.sin(rad(s.a2)),b,m);
  const large=ccwSpan(s.a1,s.a2)>180?1:0;
  return `M ${p1.x} ${p1.y} A ${s.r} ${s.r} 0 ${large} 0 ${p2.x} ${p2.y}`;
}
function svgRectPath(s,b,m){
  const r=rectNorm(s),c=s.corners||{},limit=maxCornerValue(s);
  const val=k=>Math.min(c[k]?.value||0,limit);
  const tl=val("tl"),tr=val("tr"),br=val("br"),bl=val("bl");
  const P=(x,y)=>svgPoint(x,y,b,m);
  const parts=[];
  let p=P(r.x1+bl,r.y1);parts.push("M "+p.x+" "+p.y);
  p=P(r.x2-br,r.y1);parts.push("L "+p.x+" "+p.y);
  p=P(r.x2,r.y1+br);
  if(br>EPS&&c.br?.type==="fillet")parts.push("A "+br+" "+br+" 0 0 0 "+p.x+" "+p.y);else parts.push("L "+p.x+" "+p.y);
  p=P(r.x2,r.y2-tr);parts.push("L "+p.x+" "+p.y);
  p=P(r.x2-tr,r.y2);
  if(tr>EPS&&c.tr?.type==="fillet")parts.push("A "+tr+" "+tr+" 0 0 0 "+p.x+" "+p.y);else parts.push("L "+p.x+" "+p.y);
  p=P(r.x1+tl,r.y2);parts.push("L "+p.x+" "+p.y);
  p=P(r.x1,r.y2-tl);
  if(tl>EPS&&c.tl?.type==="fillet")parts.push("A "+tl+" "+tl+" 0 0 0 "+p.x+" "+p.y);else parts.push("L "+p.x+" "+p.y);
  p=P(r.x1,r.y1+bl);parts.push("L "+p.x+" "+p.y);
  p=P(r.x1+bl,r.y1);
  if(bl>EPS&&c.bl?.type==="fillet")parts.push("A "+bl+" "+bl+" 0 0 0 "+p.x+" "+p.y);else parts.push("L "+p.x+" "+p.y);
  parts.push("Z");return parts.join(" ");
}

function svgShape(s,b,m,pdfMode=false){
  const shapeColor=pdfMode?"#000":"#111";
  const shapeWidth=pdfMode?"0.55":"0.35";
  const dimColor=pdfMode?"#8a8a8a":"#555";
  const dimTextColor=pdfMode?"#777":"#333";
  const dimWidth=pdfMode?"0.18":"0.25";
  const stroke='stroke="'+shapeColor+'" stroke-width="'+shapeWidth+'" fill="none" vector-effect="non-scaling-stroke"';
  if(s.type==="point"){
    const p=svgPoint(s.x,s.y,b,m);
    return '<circle cx="'+p.x+'" cy="'+p.y+'" r="0.8" fill="'+shapeColor+'"/>';
  }
  if(s.type==="line"){
    const a=svgPoint(s.x1,s.y1,b,m),d=svgPoint(s.x2,s.y2,b,m);
    return `<line x1="${a.x}" y1="${a.y}" x2="${d.x}" y2="${d.y}" ${stroke}/>`;
  }
  if(s.type==="circle"||s.type==="hole"){
    const c=svgPoint(s.cx,s.cy,b,m);let out=`<circle cx="${c.x}" cy="${c.y}" r="${s.r}" ${stroke}/>`;
    if(s.type==="hole"&&s.counterD&&s.counterD>s.r*2)out+=`<circle cx="${c.x}" cy="${c.y}" r="${s.counterD/2}" ${stroke}/>`;
    if(s.type==="hole"){
      const mark=Math.max(2,Math.min(5,s.r));
      out+=`<line x1="${c.x-mark}" y1="${c.y}" x2="${c.x+mark}" y2="${c.y}" ${stroke}/><line x1="${c.x}" y1="${c.y-mark}" x2="${c.x}" y2="${c.y+mark}" ${stroke}/>`;
    }
    return out;
  }
  if(s.type==="arc") return `<path d="${svgArcPath(s,b,m)}" ${stroke}/>`;
  if(s.type==="slot"){
    const p=svgPoint(s.cx-s.length/2,s.cy+s.width/2,b,m);
    return `<rect x="${p.x}" y="${p.y}" width="${s.length}" height="${s.width}" rx="${s.width/2}" ${stroke}/>`;
  }
  if(s.type==="rect"){
    return `<path d="${svgRectPath(s,b,m)}" ${stroke}/>`;
  }
  if(s.type==="dim"){
    const a=svgPoint(s.x1,s.y1,b,m),d=svgPoint(s.x2,s.y2,b,m),q=svgPoint(s.tx,s.ty,b,m),mode=s.mode==="vertical"?"vertical":"horizontal";
    let oa,ob,value;
    if(mode==="vertical"){oa={x:q.x,y:a.y};ob={x:q.x,y:d.y};value=Math.abs(s.y2-s.y1)}
    else{oa={x:a.x,y:q.y};ob={x:d.x,y:q.y};value=Math.abs(s.x2-s.x1)}
    const mx=(oa.x+ob.x)/2,my=(oa.y+ob.y)/2;
    const label=round(value)+" mm";
    const fontSize=3.5;
    const span=Math.hypot(ob.x-oa.x,ob.y-oa.y)||1;
    const ux=(ob.x-oa.x)/span,uy=(ob.y-oa.y)/span;
    const estimatedTextWidth=label.length*fontSize*0.58;
    const gapHalf=Math.min(estimatedTextWidth/2+1.6,Math.max(0,span/2-1));
    const g1={x:mx-ux*gapHalf,y:my-uy*gapHalf};
    const g2={x:mx+ux*gapHalf,y:my+uy*gapHalf};
    const dimLine=gapHalf>0
      ? `<line x1="${oa.x}" y1="${oa.y}" x2="${g1.x}" y2="${g1.y}"/><line x1="${g2.x}" y1="${g2.y}" x2="${ob.x}" y2="${ob.y}"/>`
      : `<line x1="${oa.x}" y1="${oa.y}" x2="${ob.x}" y2="${ob.y}"/>`;
    const dimText=mode==="vertical"
      ? `<text x="${mx}" y="${my}" font-size="${fontSize}" text-anchor="middle" dominant-baseline="middle" fill="${dimTextColor}" transform="rotate(-90 ${mx} ${my})">${label}</text>`
      : `<text x="${mx}" y="${my}" font-size="${fontSize}" text-anchor="middle" dominant-baseline="middle" fill="${dimTextColor}">${label}</text>`;
    return `<g stroke="${dimColor}" stroke-width="${dimWidth}" fill="none"><line x1="${a.x}" y1="${a.y}" x2="${oa.x}" y2="${oa.y}"/><line x1="${d.x}" y1="${d.y}" x2="${ob.x}" y2="${ob.y}"/>${dimLine}</g>${dimText}`;
  }
  return "";
}
function buildSVG(pdfMode=false){
  const b=exportBounds(),margin=10,framePad=5,titleH=30;
  const geomW=Math.max(30,b.maxX-b.minX),geomH=Math.max(20,b.maxY-b.minY);
  const w=geomW+margin*2,h=geomH+margin*2+titleH;
  const shapesSvg=shapes.filter(isShapeVisible).map(s=>svgShape(s,b,margin,pdfMode)).join("");
  const titleY=h-titleH;
  const splitX=w*0.55;
  const row1=titleY+8,row2=titleY+16,row3=titleY+24;
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${w}mm" height="${h}mm" viewBox="0 0 ${w} ${h}">
<rect width="${w}" height="${h}" fill="white"/>
<rect x="${framePad}" y="${framePad}" width="${w-framePad*2}" height="${h-framePad*2}" fill="none" stroke="#111" stroke-width="0.4"/>
<g font-family="Arial, sans-serif">${shapesSvg}
<line x1="${framePad}" y1="${titleY}" x2="${w-framePad}" y2="${titleY}" stroke="#111" stroke-width="0.4"/>
<line x1="${splitX}" y1="${titleY}" x2="${splitX}" y2="${h-framePad}" stroke="#111" stroke-width="0.3"/>
<line x1="${framePad}" y1="${titleY+10}" x2="${w-framePad}" y2="${titleY+10}" stroke="#111" stroke-width="0.2"/>
<line x1="${framePad}" y1="${titleY+20}" x2="${w-framePad}" y2="${titleY+20}" stroke="#111" stroke-width="0.2"/>
<text x="${framePad+3}" y="${row1}" font-size="3.7"><tspan font-weight="bold">品名:</tspan> ${xmlEscape(drawingMeta.title||"-")}</text>
<text x="${splitX+3}" y="${row1}" font-size="3.7"><tspan font-weight="bold">図番:</tspan> ${xmlEscape(drawingMeta.drawingNo||"-")}</text>
<text x="${framePad+3}" y="${row2}" font-size="3.7"><tspan font-weight="bold">材質:</tspan> ${xmlEscape(drawingMeta.material||"-")}</text>
<text x="${splitX+3}" y="${row2}" font-size="3.7"><tspan font-weight="bold">尺度:</tspan> ${xmlEscape(drawingMeta.scale||"1:1")}</text>
<text x="${framePad+3}" y="${row3}" font-size="3.7"><tspan font-weight="bold">作者:</tspan> ${xmlEscape(drawingMeta.author||"-")}</text>
<text x="${splitX+3}" y="${row3}" font-size="3.7"><tspan font-weight="bold">日付:</tspan> ${xmlEscape(drawingMeta.date||"-")}</text>
</g></svg>`;
}
function printDrawing(){
  const svg=buildSVG();
  const win=window.open("","_blank");
  if(!win){alert("ポップアップを許可してください");return;}
  win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${xmlEscape(drawingMeta.title||"2D CAD")}</title><style>body{margin:0;display:grid;place-items:center;background:#fff}svg{max-width:100vw;max-height:100vh}@media print{svg{width:100%;height:auto}}</style></head><body>${svg.replace(/^<\?xml[^>]*>\s*/,"")}<script>window.onload=()=>setTimeout(()=>window.print(),150)<\/script></body></html>`);
  win.document.close();
}

function dxfPair(code,value){return `${code}\n${value}\n`}
function dxfPoint(s){
  return dxfPair(0,"POINT")+dxfPair(8,0)+dxfPair(10,s.x)+dxfPair(20,s.y)+dxfPair(30,0);
}
function dxfLine(s){
  return dxfPair(0,"LINE")+dxfPair(8,0)+dxfPair(10,s.x1)+dxfPair(20,s.y1)+dxfPair(30,0)+dxfPair(11,s.x2)+dxfPair(21,s.y2)+dxfPair(31,0);
}
function dxfCircle(cx,cy,r){
  return dxfPair(0,"CIRCLE")+dxfPair(8,0)+dxfPair(10,cx)+dxfPair(20,cy)+dxfPair(30,0)+dxfPair(40,r);
}
function dxfArc(cx,cy,r,a1,a2){
  return dxfPair(0,"ARC")+dxfPair(8,0)+dxfPair(10,cx)+dxfPair(20,cy)+dxfPair(30,0)+dxfPair(40,r)+dxfPair(50,normDeg(a1))+dxfPair(51,normDeg(a2));
}
function dxfRect(s){
  const r=rectNorm(s),c=s.corners||{},limit=maxCornerValue(s);
  const val=k=>Math.min(c[k]?.value||0,limit);
  const tl=val("tl"),tr=val("tr"),br=val("br"),bl=val("bl");
  let out="";
  out+=dxfLine({x1:r.x1+bl,y1:r.y1,x2:r.x2-br,y2:r.y1});
  out+=dxfCorner("br",c.br,br,r);
  out+=dxfLine({x1:r.x2,y1:r.y1+br,x2:r.x2,y2:r.y2-tr});
  out+=dxfCorner("tr",c.tr,tr,r);
  out+=dxfLine({x1:r.x2-tr,y1:r.y2,x2:r.x1+tl,y2:r.y2});
  out+=dxfCorner("tl",c.tl,tl,r);
  out+=dxfLine({x1:r.x1,y1:r.y2-tl,x2:r.x1,y2:r.y1+bl});
  out+=dxfCorner("bl",c.bl,bl,r);
  return out;
}
function dxfCorner(key,mod,v,r){
  if(!mod||v<=EPS) return "";
  if(mod.type==="chamfer"){
    const a={br:{x:r.x2-v,y:r.y1},tr:{x:r.x2,y:r.y2-v},tl:{x:r.x1+v,y:r.y2},bl:{x:r.x1,y:r.y1+v}}[key];
    const b={br:{x:r.x2,y:r.y1+v},tr:{x:r.x2-v,y:r.y2},tl:{x:r.x1,y:r.y2-v},bl:{x:r.x1+v,y:r.y1}}[key];
    return dxfLine({x1:a.x,y1:a.y,x2:b.x,y2:b.y});
  }
  const centers={br:{x:r.x2-v,y:r.y1+v},tr:{x:r.x2-v,y:r.y2-v},tl:{x:r.x1+v,y:r.y2-v},bl:{x:r.x1+v,y:r.y1+v}};
  const angles={br:[270,360],tr:[0,90],tl:[90,180],bl:[180,270]};
  return dxfArc(centers[key].x,centers[key].y,v,angles[key][0],angles[key][1]);
}
function toDXF(){
  let body="";
  for(const s of shapes){
    if(s.type==="point") body+=dxfPoint(s);
    if(s.type==="line") body+=dxfLine(s);
    if(s.type==="circle" || s.type==="hole") body+=dxfCircle(s.cx,s.cy,Math.abs(s.r));
    if(s.type==="hole" && s.counterD && s.counterD>s.r*2) body+=dxfCircle(s.cx,s.cy,Math.abs(s.counterD/2));
    if(s.type==="arc") body+=dxfArc(s.cx,s.cy,Math.abs(s.r),s.a1,s.a2);
    if(s.type==="rect") body+=dxfRect(s);
    if(s.type==="slot"){
      const r=s.width/2;
      const hs=Math.max(0,(s.length-s.width)/2);
      body+=dxfLine({x1:s.cx-hs,y1:s.cy+r,x2:s.cx+hs,y2:s.cy+r});
      body+=dxfArc(s.cx+hs,s.cy,r,270,90);
      body+=dxfLine({x1:s.cx+hs,y1:s.cy-r,x2:s.cx-hs,y2:s.cy-r});
      body+=dxfArc(s.cx-hs,s.cy,r,90,270);
    }
  }
  return dxfPair(0,"SECTION")+dxfPair(2,"HEADER")+dxfPair(0,"ENDSEC")+
    dxfPair(0,"SECTION")+dxfPair(2,"ENTITIES")+body+dxfPair(0,"ENDSEC")+dxfPair(0,"EOF");
}
function parseDXF(text){
  const lines=text.replace(/\r/g,"").split("\n");
  const pairs=[];
  for(let i=0;i+1<lines.length;i+=2)pairs.push({code:parseInt(lines[i].trim(),10),value:lines[i+1].trim()});
  const out=[];let inEntities=false,i=0;
  while(i<pairs.length){
    const p=pairs[i];
    if(p.code===0&&p.value==="SECTION"&&pairs[i+1]?.code===2&&pairs[i+1]?.value==="ENTITIES"){inEntities=true;i+=2;continue;}
    if(inEntities&&p.code===0&&p.value==="ENDSEC")break;
    if(!inEntities||p.code!==0){i++;continue;}
    const type=p.value;const vals=[];i++;
    while(i<pairs.length&&pairs[i].code!==0){vals.push(pairs[i]);i++;}
    const one=code=>vals.find(x=>x.code===code)?.value;
    const nums=code=>vals.filter(x=>x.code===code).map(x=>num(x.value));
    const layer=ensureLayer(one(8)||"0");
    if(type==="LINE"){
      out.push({id:newId(),type:"line",x1:num(one(10)),y1:num(one(20)),x2:num(one(11)),y2:num(one(21)),layer});
    }else if(type==="CIRCLE"){
      out.push({id:newId(),type:"circle",cx:num(one(10)),cy:num(one(20)),r:Math.abs(num(one(40))),layer});
    }else if(type==="ARC"){
      out.push({id:newId(),type:"arc",cx:num(one(10)),cy:num(one(20)),r:Math.abs(num(one(40))),a1:normDeg(num(one(50))),a2:normDeg(num(one(51))),layer});
    }else if(type==="LWPOLYLINE"){
      const xs=nums(10),ys=nums(20),n=Math.min(xs.length,ys.length);
      for(let k=0;k<n-1;k++)out.push({id:newId(),type:"line",x1:xs[k],y1:ys[k],x2:xs[k+1],y2:ys[k+1],layer});
      const closed=(parseInt(one(70)||"0",10)&1)!==0;
      if(closed&&n>2)out.push({id:newId(),type:"line",x1:xs[n-1],y1:ys[n-1],x2:xs[0],y2:ys[0],layer});
    }
  }
  return out;
}

qs("dxfImportBtn").addEventListener("click",()=>{
  closeTransferMenus();
  qs("dxfInput").click();
});
qs("dxfInput").addEventListener("change",async e=>{
  const f=e.target.files?.[0];if(!f)return;
  try{
    const imported=parseDXF(await f.text());
    if(!imported.length)throw new Error("no supported entities");
    shapes.push(...imported);snapshot();fitView();hint.textContent="DXFを読み込みました: "+imported.length+"要素";
  }catch(err){alert("DXFを読み込めませんでした。対応: LINE / CIRCLE / ARC / LWPOLYLINE");}
  e.target.value="";
});

function safeFileBaseName(value){
  return String(value||"")
    .trim()
    .replace(/[\\/:*?"<>|]+/g,"_")
    .replace(/\s+/g," ")
    .replace(/[. ]+$/g,"") || "2d-cad-drawing";
}

let exportFormat="";
let exportDirectoryHandle=null;
let exportFileHandle=null;
let pdfPreviewUrl="";

function exportExtension(format){
  if(format==="json") return ".json";
  return format==="dxf"?".dxf":format==="svg"?".svg":".pdf";
}

function exportMime(format){
  if(format==="json") return "application/json";
  return format==="dxf"?"application/dxf":format==="svg"?"image/svg+xml":"application/pdf";
}

function exportDescription(format){
  if(format==="json") return "編集データ";
  return format==="dxf"?"DXF CADファイル":format==="svg"?"SVG画像ファイル":"PDF図面";
}

function normalizeExportFileName(value,format){
  const ext=exportExtension(format);
  let raw=safeFileBaseName(value);
  for(const oldExt of [".json",".dxf",".svg",".pdf"]){
    if(raw.toLowerCase().endsWith(oldExt)) raw=raw.slice(0,-oldExt.length);
  }
  return (raw||"2d-cad-drawing")+ext;
}

function defaultExportFileName(format){
  const base=safeFileBaseName(drawingMeta.drawingNo || drawingMeta.title || "2d-cad-drawing");
  return normalizeExportFileName(base,format);
}

function resetExportLocation(message="未選択"){
  exportDirectoryHandle=null;
  exportFileHandle=null;
  if(qs("exportSaveLocation")) qs("exportSaveLocation").value=message;
}

function openExportSavePanel(format){
  exportFormat=format;
  resetExportLocation();
  closePdfPreview(false);
  const label=format==="json"?"編集データ":format.toUpperCase();
  if(qs("fileSaveTitle")) qs("fileSaveTitle").textContent=format==="json"?"編集データを保存":label+"出力";
  if(qs("exportFileName")) qs("exportFileName").value=defaultExportFileName(format);
  if(qs("confirmExportBtn")) qs("confirmExportBtn").textContent=format==="pdf"?"プレビュー":"決定";
  qs("fileSavePanel")?.classList.remove("hidden");
  setTimeout(()=>qs("exportFileName")?.select(),0);
}

async function chooseExportLocation(){
  const fileName=normalizeExportFileName(qs("exportFileName")?.value,exportFormat);
  if(qs("exportFileName")) qs("exportFileName").value=fileName;

  if(typeof window.showDirectoryPicker==="function"){
    try{
      exportDirectoryHandle=await window.showDirectoryPicker({mode:"readwrite"});
      exportFileHandle=null;
      if(qs("exportSaveLocation")) qs("exportSaveLocation").value="フォルダー: "+exportDirectoryHandle.name;
      return true;
    }catch(err){
      if(err?.name==="AbortError") return false;
    }
  }

  if(typeof window.showSaveFilePicker==="function"){
    try{
      exportFileHandle=await window.showSaveFilePicker({
        suggestedName:fileName,
        types:[{
          description:exportDescription(exportFormat),
          accept:{[exportMime(exportFormat)]:[exportExtension(exportFormat)]}
        }]
      });
      exportDirectoryHandle=null;
      if(qs("exportSaveLocation")) qs("exportSaveLocation").value="保存先を選択済み: "+exportFileHandle.name;
      return true;
    }catch(err){
      if(err?.name==="AbortError") return false;
    }
  }

  if(qs("exportSaveLocation")) qs("exportSaveLocation").value="端末の通常のダウンロード先";
  return true;
}

function concatByteArrays(parts){
  const total=parts.reduce((n,p)=>n+p.length,0);
  const out=new Uint8Array(total);
  let offset=0;
  for(const p of parts){out.set(p,offset);offset+=p.length}
  return out;
}

function makeJpegPdf(jpegBytes,pixelW,pixelH,pageWpt,pageHpt){
  const enc=new TextEncoder();
  const parts=[];
  const offsets=[0];
  let length=0;
  const push=value=>{
    const bytes=typeof value==="string"?enc.encode(value):value;
    parts.push(bytes);length+=bytes.length;
  };
  const startObj=n=>{offsets[n]=length;push(n+" 0 obj\n")};

  push("%PDF-1.4\n%CAD\n");
  startObj(1);push("<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");
  startObj(2);push("<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n");
  startObj(3);push("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 "+pageWpt.toFixed(2)+" "+pageHpt.toFixed(2)+"] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>\nendobj\n");
  startObj(4);
  push("<< /Type /XObject /Subtype /Image /Width "+pixelW+" /Height "+pixelH+" /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length "+jpegBytes.length+" >>\nstream\n");
  push(jpegBytes);
  push("\nendstream\nendobj\n");
  const content="q\n"+pageWpt.toFixed(2)+" 0 0 "+pageHpt.toFixed(2)+" 0 0 cm\n/Im0 Do\nQ\n";
  const contentBytes=enc.encode(content);
  startObj(5);
  push("<< /Length "+contentBytes.length+" >>\nstream\n");
  push(contentBytes);
  push("endstream\nendobj\n");

  const xrefOffset=length;
  push("xref\n0 6\n0000000000 65535 f \n");
  for(let i=1;i<=5;i++) push(String(offsets[i]).padStart(10,"0")+" 00000 n \n");
  push("trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n"+xrefOffset+"\n%%EOF");
  return new Blob([concatByteArrays(parts)],{type:"application/pdf"});
}

async function buildPdfBlob(){
  const svg=buildSVG(true);
  const size=svg.match(/width="([0-9.]+)mm" height="([0-9.]+)mm"/);
  const mmW=size?Number(size[1]):210;
  const mmH=size?Number(size[2]):297;
  const maxPx=4096;
  const pxPerMm=Math.min(5,maxPx/Math.max(mmW,mmH));
  const pixelW=Math.max(1,Math.round(mmW*pxPerMm));
  const pixelH=Math.max(1,Math.round(mmH*pxPerMm));
  const svgBlob=new Blob([svg],{type:"image/svg+xml;charset=utf-8"});
  const url=URL.createObjectURL(svgBlob);
  try{
    const img=new Image();
    await new Promise((resolve,reject)=>{
      img.onload=resolve;
      img.onerror=()=>reject(new Error("SVG render failed"));
      img.src=url;
    });
    const canvas=document.createElement("canvas");
    canvas.width=pixelW;canvas.height=pixelH;
    const c=canvas.getContext("2d");
    c.fillStyle="#fff";
    c.fillRect(0,0,pixelW,pixelH);
    c.drawImage(img,0,0,pixelW,pixelH);
    const jpegBlob=await new Promise(resolve=>canvas.toBlob(resolve,"image/jpeg",0.94));
    if(!jpegBlob) throw new Error("PDF image creation failed");
    const jpegBytes=new Uint8Array(await jpegBlob.arrayBuffer());
    return makeJpegPdf(jpegBytes,pixelW,pixelH,mmW*72/25.4,mmH*72/25.4);
  }finally{
    URL.revokeObjectURL(url);
  }
}

async function buildExportBlob(format){
  if(format==="json") return new Blob([JSON.stringify({
    version:VERSION,unit:"mm",shapes,drawingMeta,layerVisibility
  },null,2)],{type:"application/json"});
  if(format==="dxf") return new Blob([toDXF()],{type:"application/dxf"});
  if(format==="svg") return new Blob([buildSVG()],{type:"image/svg+xml;charset=utf-8"});
  if(format==="pdf") return await buildPdfBlob();
  throw new Error("unknown export format");
}

function downloadBlob(name,blob){
  const a=document.createElement("a");
  a.href=URL.createObjectURL(blob);
  a.download=name;
  a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href),1200);
}

function closePdfPreview(showSavePanel=false){
  if(pdfPreviewUrl){
    URL.revokeObjectURL(pdfPreviewUrl);
    pdfPreviewUrl="";
  }
  const img=qs("pdfPreviewImage");
  if(img) img.removeAttribute("src");
  qs("pdfPreviewPanel")?.classList.add("hidden");
  if(showSavePanel) qs("fileSavePanel")?.classList.remove("hidden");
}

async function showPdfPreview(){
  if(exportFormat!=="pdf") return;

  const fileName=normalizeExportFileName(qs("exportFileName")?.value,exportFormat);
  if(qs("exportFileName")) qs("exportFileName").value=fileName;

  const btn=qs("confirmExportBtn");
  if(btn){btn.disabled=true;btn.textContent="作成中…"}
  try{
    closePdfPreview(false);
    const previewSvg=buildSVG(true);
    pdfPreviewUrl=URL.createObjectURL(new Blob([previewSvg],{type:"image/svg+xml;charset=utf-8"}));
    if(qs("pdfPreviewImage")) qs("pdfPreviewImage").src=pdfPreviewUrl;
    qs("fileSavePanel")?.classList.add("hidden");
    qs("pdfPreviewPanel")?.classList.remove("hidden");
  }catch(err){
    alert("PDFプレビューを作成できませんでした。");
  }finally{
    if(btn){btn.disabled=false;btn.textContent="プレビュー"}
  }
}

async function handleExportDecision(){
  if(exportFormat==="pdf"){
    await showPdfPreview();
    return;
  }
  await confirmExportSave();
}

async function confirmExportSave(){
  if(!exportFormat) return;
  const fileName=normalizeExportFileName(qs("exportFileName")?.value,exportFormat);
  if(qs("exportFileName")) qs("exportFileName").value=fileName;

  if(!exportDirectoryHandle && !exportFileHandle && qs("exportSaveLocation")?.value==="未選択"){
    const chosen=await chooseExportLocation();
    if(!chosen) return;
  }

  const btn=qs("confirmExportBtn");
  if(btn){btn.disabled=true;btn.textContent="保存中…"}
  try{
    const blob=await buildExportBlob(exportFormat);

    if(exportDirectoryHandle){
      const handle=await exportDirectoryHandle.getFileHandle(fileName,{create:true});
      const writable=await handle.createWritable();
      await writable.write(blob);
      await writable.close();
    }else if(exportFileHandle){
      const writable=await exportFileHandle.createWritable();
      await writable.write(blob);
      await writable.close();
    }else{
      downloadBlob(fileName,blob);
    }

    qs("fileSavePanel")?.classList.add("hidden");
    closePdfPreview(false);
    hint.textContent=exportFormat==="json"?"編集データを保存しました":exportFormat.toUpperCase()+"を保存しました";
  }catch(err){
    alert("保存できませんでした。もう一度お試しください。");
  }finally{
    if(btn){btn.disabled=false;btn.textContent="決定"}
  }
}

qs("exportFileName")?.addEventListener("input",()=>{
  if(exportDirectoryHandle) return;
  if(exportFileHandle) resetExportLocation("ファイル名変更後、保存先を再選択してください");
});
qs("chooseExportLocationBtn").addEventListener("click",chooseExportLocation);
qs("confirmExportBtn").addEventListener("click",handleExportDecision);
qs("closeFileSaveBtn").addEventListener("click",()=>{
  qs("fileSavePanel").classList.add("hidden");
  closePdfPreview(false);
});
qs("backPdfPreviewBtn").addEventListener("click",()=>closePdfPreview(true));
qs("closePdfPreviewBtn").addEventListener("click",()=>closePdfPreview(true));
qs("savePdfPreviewBtn").addEventListener("click",confirmExportSave);

qs("dxfBtn").addEventListener("click",()=>{
  closeTransferMenus();
  openExportSavePanel("dxf");
});
qs("svgBtn").addEventListener("click",()=>{
  closeTransferMenus();
  openExportSavePanel("svg");
});
qs("printBtn").addEventListener("click",()=>{
  closeTransferMenus();
  openExportSavePanel("pdf");
});
qs("sheetBtn").addEventListener("click",()=>{
  closeTransferMenus();
  qs("fileSavePanel")?.classList.add("hidden");
  closePdfPreview(false);
  syncSheetInputs();
  qs("sheetPanel").classList.remove("hidden");
});
qs("closeSheetBtn").addEventListener("click",()=>qs("sheetPanel").classList.add("hidden"));
qs("saveSheetBtn").addEventListener("click",()=>{
  drawingMeta={
    title:qs("sheetTitle").value.trim(),
    drawingNo:qs("sheetNo").value.trim(),
    scale:qs("sheetScale").value.trim()||"1:1",
    author:qs("sheetName").value.trim(),
    material:qs("sheetMaterial").value.trim(),
    date:qs("sheetDate").value
  };
  autoSave();qs("sheetPanel").classList.add("hidden");hint.textContent="図面情報を保存しました";
});

try{
  const saved=JSON.parse(localStorage.getItem(STORAGE_KEY));
  if(saved && Array.isArray(saved.shapes)){
    shapes=saved.shapes.map(s=>assignLayer(s,"0"));
    const cleaned=cleanupRedundantLines();
    nextId=Math.max(1,...shapes.map(s=>num(s.id)+1));
    if(cleaned) setTimeout(()=>{autoSave();hint.textContent=cleaned+"本の重複直線を整理しました"},0);
    if(saved.drawingMeta) drawingMeta={...drawingMeta,...saved.drawingMeta};
    if(saved.layerVisibility){
      for(let i=0;i<=10;i++){
        const k=String(i);
        if(typeof saved.layerVisibility[k]==="boolean") layerVisibility[k]=saved.layerVisibility[k];
      }
    }
  }
}catch{}

snapshot();
setTool("select");
window.addEventListener("resize",resize);
resize();


if ("serviceWorker" in navigator) {
  let swReloading=false;
  navigator.serviceWorker.addEventListener("controllerchange",()=>{
    if(swReloading) return;
    swReloading=true;
    location.reload();
  });
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("./sw.js?v=138",{updateViaCache:"none"})
      .then(reg=>reg.update())
      .catch(() => {});
  });
}
