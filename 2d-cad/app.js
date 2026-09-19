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
let panDrag = null;
let layerVisibility=Object.fromEntries(Array.from({length:11},(_,i)=>[String(i),true]));
let selectedIds=new Set();
let activeTouchPointers=new Map();
let touchGesture=null;
let touchGestureActive=false;
let drawingMeta={title:"加工図",drawingNo:"",scale:"1:1",author:""};
let quickCreatedId=null;

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
  return s;
}
function isShapeVisible(s){return layerVisibility[s.layer||"0"]!==false;}

function shapeLabel(type){
  return {
    line:"直線",rect:"四角",circle:"円",hole:"穴",slot:"長穴",arc:"円弧",
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
  if(qs("sheetTitle")) qs("sheetTitle").value=drawingMeta.title||"加工図";
  if(qs("sheetNo")) qs("sheetNo").value=drawingMeta.drawingNo||"";
  if(qs("sheetScale")) qs("sheetScale").value=drawingMeta.scale||"1:1";
  if(qs("sheetName")) qs("sheetName").value=drawingMeta.author||"";
}

function drawGrid(w,h){
  const left=screenToWorld({x:0,y:h}).x;
  const right=screenToWorld({x:w,y:0}).x;
  const bottom=screenToWorld({x:0,y:h}).y;
  const top=screenToWorld({x:w,y:0}).y;
  const step = scale>=7 ? 5 : scale>=2.5 ? 10 : 20;

  ctx.save();
  ctx.lineWidth=1;
  ctx.font="10px system-ui";
  ctx.fillStyle="#8d98a3";

  for(let x=Math.floor(left/step)*step;x<=right;x+=step){
    const sx=worldToScreen({x,y:0}).x;
    ctx.strokeStyle = Math.abs(x)<0.001 ? "#a9b2bb" : "#edf0f3";
    ctx.beginPath();ctx.moveTo(sx,0);ctx.lineTo(sx,h);ctx.stroke();
    if(x!==0 && sx>20) ctx.fillText(String(round(x,0)),sx+2,Math.min(h-4,origin.y+13));
  }
  for(let y=Math.floor(bottom/step)*step;y<=top;y+=step){
    const sy=worldToScreen({x:0,y}).y;
    ctx.strokeStyle = Math.abs(y)<0.001 ? "#a9b2bb" : "#edf0f3";
    ctx.beginPath();ctx.moveTo(0,sy);ctx.lineTo(w,sy);ctx.stroke();
    if(y!==0 && sy<h-12) ctx.fillText(String(round(y,0)),Math.max(3,origin.x+4),sy-3);
  }
  ctx.restore();
}

function drawDimensionText(text,x,y,selected=false){
  ctx.save();
  ctx.font="12px system-ui";
  const pad=4;
  const width=ctx.measureText(text).width+pad*2;
  ctx.fillStyle="rgba(255,255,255,.92)";
  ctx.fillRect(x-width/2,y-10,width,16);
  ctx.fillStyle=selected ? "#0b63ce" : "#4d5965";
  ctx.textAlign="center";
  ctx.fillText(text,x,y+2);
  ctx.restore();
}

function drawShape(s,isPreview=false){
  const selected = !isPreview && (s.id===selectedId || selectedIds.has(s.id));
  ctx.save();
  ctx.strokeStyle = isPreview ? "#7c8792" : selected ? "#0b63ce" : "#111820";
  ctx.lineWidth = selected ? 3 : 2;
  if(isPreview) ctx.setLineDash([6,5]);

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
  const mode=s.mode||"aligned";
  let oa,ob,value;

  if(mode==="horizontal"){
    oa={x:a.x,y:q.y}; ob={x:b.x,y:q.y}; value=Math.abs(s.x2-s.x1);
  }else if(mode==="vertical"){
    oa={x:q.x,y:a.y}; ob={x:q.x,y:b.y}; value=Math.abs(s.y2-s.y1);
  }else{
    const vx=b.x-a.x,vy=b.y-a.y,len=Math.hypot(vx,vy)||1;
    const nx=-vy/len,ny=vx/len;
    const mid={x:(a.x+b.x)/2,y:(a.y+b.y)/2};
    const off=(q.x-mid.x)*nx+(q.y-mid.y)*ny;
    oa={x:a.x+nx*off,y:a.y+ny*off};
    ob={x:b.x+nx*off,y:b.y+ny*off};
    value=Math.hypot(s.x2-s.x1,s.y2-s.y1);
  }

  ctx.save();
  ctx.strokeStyle=isPreview?"#7c8792":selected?"#0b63ce":"#4d5965";
  ctx.lineWidth=1.2;
  if(isPreview)ctx.setLineDash([5,4]);
  ctx.beginPath();
  ctx.moveTo(a.x,a.y);ctx.lineTo(oa.x,oa.y);
  ctx.moveTo(b.x,b.y);ctx.lineTo(ob.x,ob.y);
  ctx.moveTo(oa.x,oa.y);ctx.lineTo(ob.x,ob.y);
  const span=Math.hypot(ob.x-oa.x,ob.y-oa.y)||1;
  const ux=(ob.x-oa.x)/span,uy=(ob.y-oa.y)/span,ah=6;
  ctx.moveTo(oa.x,oa.y);ctx.lineTo(oa.x+ux*ah-uy*3,oa.y+uy*ah+ux*3);
  ctx.moveTo(oa.x,oa.y);ctx.lineTo(oa.x+ux*ah+uy*3,oa.y+uy*ah-ux*3);
  ctx.moveTo(ob.x,ob.y);ctx.lineTo(ob.x-ux*ah-uy*3,ob.y-uy*ah+ux*3);
  ctx.moveTo(ob.x,ob.y);ctx.lineTo(ob.x-ux*ah+uy*3,ob.y-uy*ah-ux*3);
  ctx.stroke();
  drawDimensionText(round(value)+" mm",(oa.x+ob.x)/2,(oa.y+ob.y)/2-6,selected);
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

function draw(){
  const r=canvas.getBoundingClientRect();
  ctx.clearRect(0,0,r.width,r.height);
  drawGrid(r.width,r.height);
  shapes.filter(isShapeVisible).forEach(s=>drawShape(s));
  if(preview) drawShape(preview,true);
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
  if(s.type==="line"){s.x1+=dx;s.y1+=dy;s.x2+=dx;s.y2+=dy}
  if(s.type==="rect"){s.x+=dx;s.y+=dy}
  if(s.type==="circle" || s.type==="hole" || s.type==="arc"){s.cx+=dx;s.cy+=dy}
  if(s.type==="slot"){s.cx+=dx;s.cy+=dy}
  if(s.type==="dim"){s.x1+=dx;s.y1+=dy;s.x2+=dx;s.y2+=dy;s.tx+=dx;s.ty+=dy}
}

canvas.addEventListener("pointerdown",e=>{
  canvas.setPointerCapture?.(e.pointerId);

  if(e.pointerType==="touch"){
    activeTouchPointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
    if(activeTouchPointers.size>=2){
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
  const p=snapPoint(raw);

  if(tool==="pan"){
    panDrag={sx:e.clientX,sy:e.clientY,ox:origin.x,oy:origin.y};
    hint.textContent="ドラッグして表示位置を移動";
    return;
  }
  if(tool==="dimension"){ handleDimensionTap(p); return; }
  if(tool==="multi"){ handleMultiTap(raw); return; }
  if(tool==="trim"){ handleTrimTap(raw); return; }
  if(tool==="offset"){ handleOffsetTap(raw); return; }
  if(tool==="chamfer" || tool==="fillet"){ handleCornerTap(raw); return; }
  if(tool==="copy"){ handleCopyTap(raw); return; }
  if(tool==="mirror"){ handleMirrorTap(raw); return; }
  if(tool==="rotate"){ handleRotateTap(raw); return; }
  if(tool==="arc"){ handleArcTap(p); return; }

  if(tool==="select"){
    const s=hitTest(raw);
    selectedId=s?.id ?? null;
    if(s){
      drag={id:s.id,start:raw,before:JSON.parse(JSON.stringify(s))};
      openProperty(s);
      hint.textContent="ドラッグで移動できます";
    }else{
      closeProperty();
      hint.textContent="図形をタップして選択できます";
    }
    draw();
    return;
  }

  if(!start){
    start=p;
    hint.textContent="終点をタップしてください";
  }else{
    const shape=shapeFromPoints(start,p);
    if(shape){
      shapes.push(shape);
      selectedId=shape.id;
      snapshot();
    }
    start=null;preview=null;
    hint.textContent="続けて作図できます";
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

  if(tool==="dimension" && dimDraft?.stage===2){
    const p=snapPoint(raw);
    preview={id:-1,type:"dim",x1:dimDraft.a.x,y1:dimDraft.a.y,x2:dimDraft.b.x,y2:dimDraft.b.y,
      tx:p.x,ty:p.y,mode:qs("dimensionModeSelect")?.value||"aligned"};
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

  if(tool==="select" && drag){
    const s=selectedShape();
    if(!s) return;
    Object.assign(s,JSON.parse(JSON.stringify(drag.before)));
    translateShape(s,raw.x-drag.start.x,raw.y-drag.start.y);
    draw();
    return;
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
  if(tool==="pan" && panDrag){panDrag=null;hint.textContent="画面をドラッグして移動";return;}
  if(tool==="select" && drag){
    const s=selectedShape();
    if(s){
      if(s.type==="line"){
        s.x1=snapValue(s.x1);s.y1=snapValue(s.y1);s.x2=snapValue(s.x2);s.y2=snapValue(s.y2);
      }else if(s.type==="rect"){
        s.x=snapValue(s.x);s.y=snapValue(s.y);
      }else if(s.type==="circle"||s.type==="hole"||s.type==="arc"||s.type==="slot"){
        s.cx=snapValue(s.cx);s.cy=snapValue(s.cy);
      }else if(s.type==="dim"){
        s.x1=snapValue(s.x1);s.y1=snapValue(s.y1);s.x2=snapValue(s.x2);s.y2=snapValue(s.y2);
        s.tx=snapValue(s.tx);s.ty=snapValue(s.ty);
      }
      snapshot();openProperty(s);
    }
    drag=null;draw();
  }
});

function setTool(next){
  tool=next;start=null;preview=null;drag=null;opState=null;arcDraft=null;dimDraft=null;panDrag=null;
  quickCreatedId=null;
  qs("dimensionModeDock")?.classList.toggle("hidden",tool!=="dimension");
  document.querySelectorAll(".tool").forEach(b=>b.classList.toggle("active",b.dataset.tool===tool));
  selectedId=null;
  if(tool!=="multi") selectedIds.clear();
  closeProperty();quickPanel.classList.add("hidden");
  qs("createByValueBtn").textContent="この寸法で作成";

  if(tool==="select") hint.textContent="図形をタップして選択できます";
  else if(tool==="trim") hint.textContent="削る側の直線をタップ";
  else if(tool==="offset") hint.textContent="オフセット元の図形をタップ";
  else if(tool==="chamfer") hint.textContent="面取りする四角の角をタップ";
  else if(tool==="fillet") hint.textContent="Rを付ける四角の角をタップ";
  else if(tool==="copy") hint.textContent="コピーする図形をタップ";
  else if(tool==="mirror") hint.textContent="ミラーする図形をタップ";
  else if(tool==="rotate") hint.textContent="回転する図形をタップ";
  else if(tool==="dimension") hint.textContent="寸法の始点をタップ";
  else if(tool==="multi"){hint.textContent="複数の図形をタップして選択";openMultiPanel();}
  else if(tool==="pan") hint.textContent="画面をドラッグして移動";
  else if(tool==="arc"){
    openQuick(tool);
    hint.textContent="中心→始点→終点の順にタップ、または数値入力";
  }else{
    openQuick(tool);
    hint.textContent="始点をタップ、または数値入力";
  }
  draw();
}

document.querySelectorAll(".tool[data-tool]").forEach(btn=>btn.addEventListener("click",()=>setTool(btn.dataset.tool)));

function handleDimensionTap(p){
  if(!dimDraft){dimDraft={stage:1,a:p};preview=null;hint.textContent="寸法の終点をタップ";return;}
  if(dimDraft.stage===1){dimDraft.b=p;dimDraft.stage=2;hint.textContent="寸法を置く位置をタップ";return;}
  const s={id:newId(),type:"dim",x1:dimDraft.a.x,y1:dimDraft.a.y,x2:dimDraft.b.x,y2:dimDraft.b.y,
    tx:p.x,ty:p.y,mode:qs("dimensionModeSelect")?.value||"aligned",layer:currentLayer()};
  shapes.push(s);selectedId=s.id;snapshot();dimDraft=null;preview=null;hint.textContent="寸法線を作成しました";draw();
}

function openMultiPanel(){
  qs("quickTitle").textContent="複数選択";
  quickFields.innerHTML=
    '<div class="multi-count">選択: '+selectedIds.size+'個</div>'+
    field("qMultiDX","X移動",0)+field("qMultiDY","Y移動",0)+
    '<button id="multiDeleteBtn" class="danger" type="button">選択を削除</button>';
  qs("createByValueBtn").textContent="まとめて移動";
  quickPanel.classList.remove("hidden");
  qs("multiDeleteBtn").addEventListener("click",deleteMultiSelected);
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
  shapes.filter(s=>selectedIds.has(s.id)).forEach(s=>translateShape(s,dx,dy));
  snapshot();openMultiPanel();hint.textContent=selectedIds.size+"個を移動しました";draw();
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


function handleCopyTap(p){
  const source=hitTest(p);
  if(!source){hint.textContent="コピーする図形をタップ";return;}
  selectedId=source.id;opState={sourceId:source.id};
  qs("quickTitle").textContent="コピー";
  quickFields.innerHTML=field("qDX","X方向",10)+field("qDY","Y方向",0);
  qs("createByValueBtn").textContent="コピー作成";
  quickPanel.classList.remove("hidden");
  hint.textContent="移動量を入力してください";draw();
}

function handleRotateTap(p){
  const source=hitTest(p,s=>s.type!=="dim");
  if(!source){hint.textContent="回転する図形をタップ";return;}
  selectedId=source.id;opState={sourceId:source.id};
  qs("quickTitle").textContent="回転";
  quickFields.innerHTML=field("qRotateAngle","角度 °",90)+field("qRotateX","基準 X",0)+field("qRotateY","基準 Y",0);
  qs("createByValueBtn").textContent="回転作成";
  quickPanel.classList.remove("hidden");
  hint.textContent="角度と基準点を入力してください";draw();
}

function rotatePoint(p,c,a){
  const ca=Math.cos(a),sa=Math.sin(a),dx=p.x-c.x,dy=p.y-c.y;
  return {x:c.x+dx*ca-dy*sa,y:c.y+dx*sa+dy*ca};
}

function applyRotate(){
  const source=shapes.find(s=>s.id===opState?.sourceId);if(!source)return;
  const s=JSON.parse(JSON.stringify(source));s.id=newId();
  const c={x:num(qs("qRotateX")?.value),y:num(qs("qRotateY")?.value)},a=rad(num(qs("qRotateAngle")?.value));
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
  shapes.push(s);selectedId=s.id;snapshot();opState=null;quickPanel.classList.add("hidden");
  qs("createByValueBtn").textContent="この寸法で作成";hint.textContent="回転コピーしました";draw();
}

function handleMirrorTap(p){
  const source=hitTest(p);
  if(!source){hint.textContent="ミラーする図形をタップ";return;}
  selectedId=source.id;opState={sourceId:source.id};
  qs("quickTitle").textContent="ミラー";
  quickFields.innerHTML='<div class="field"><label for="qMirrorAxis">基準線</label><select id="qMirrorAxis"><option value="Y">縦線 X=</option><option value="X">横線 Y=</option></select></div>'+field("qMirrorValue","基準座標",0);
  qs("createByValueBtn").textContent="ミラー作成";
  quickPanel.classList.remove("hidden");
  hint.textContent="基準線を指定してください";draw();
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
  shapes.push(s);selectedId=s.id;snapshot();opState=null;quickPanel.classList.add("hidden");
  qs("createByValueBtn").textContent="この寸法で作成";hint.textContent="コピーしました";draw();
}

function applyMirror(){
  const source=shapes.find(s=>s.id===opState?.sourceId);if(!source)return;
  const s=JSON.parse(JSON.stringify(source));s.id=newId();
  const axis=qs("qMirrorAxis")?.value||"Y",v=num(qs("qMirrorValue")?.value);

  if(s.type==="line"){
    if(axis==="Y"){s.x1=2*v-s.x1;s.x2=2*v-s.x2}else{s.y1=2*v-s.y1;s.y2=2*v-s.y2}
  }else if(s.type==="rect"){
    const r=rectNorm(s);
    if(axis==="Y"){s.x=2*v-r.x2;s.y=r.y1;s.w=r.w;s.h=r.h}
    else{s.x=r.x1;s.y=2*v-r.y2;s.w=r.w;s.h=r.h}
    swapCornersForMirror(s,axis);
  }else if(s.type==="circle"||s.type==="hole"||s.type==="slot"){
    if(axis==="Y")s.cx=2*v-s.cx;else s.cy=2*v-s.cy;
  }else if(s.type==="arc"){
    if(axis==="Y"){
      s.cx=2*v-s.cx;
      const old1=s.a1,old2=s.a2;
      s.a1=normDeg(180-old2);s.a2=normDeg(180-old1);
    }else{
      s.cy=2*v-s.cy;
      const old1=s.a1,old2=s.a2;
      s.a1=normDeg(-old2);s.a2=normDeg(-old1);
    }
  }
  shapes.push(s);selectedId=s.id;snapshot();opState=null;quickPanel.classList.add("hidden");
  qs("createByValueBtn").textContent="この寸法で作成";hint.textContent="ミラーしました";draw();
}


function field(name,label,value=0,step="any"){
  return `<div class="field"><label for="${name}">${label}</label><input id="${name}" type="number" inputmode="decimal" enterkeyhint="done" autocomplete="off" step="${step}" value="${round(num(value))}"></div>`;
}

function enableDirectNumberEntry(root=document){
  root.querySelectorAll?.('input[type="number"]').forEach(input=>{
    if(input.dataset.directEntry==="1") return;
    input.dataset.directEntry="1";
    const selectAll=()=>requestAnimationFrame(()=>{
      try{input.select()}catch{}
    });
    input.addEventListener("focus",selectAll);
    input.addEventListener("click",selectAll);
    input.addEventListener("touchend",selectAll,{passive:true});
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
  if(s.type==="line"){
    html+=field("pX1","始点 X",s.x1)+field("pY1","始点 Y",s.y1)+field("pX2","終点 X",s.x2)+field("pY2","終点 Y",s.y2);
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
    html+='<div class="field"><label>寸法方向</label><select id="pDimMode"><option value="aligned">平行</option><option value="horizontal">水平</option><option value="vertical">垂直</option></select></div>';
    setTimeout(()=>{if(qs("pDimMode"))qs("pDimMode").value=s.mode||"aligned"},0);
  }
  propertyFields.innerHTML=html;
  enableDirectNumberEntry(propertyPanel);
}

function closeProperty(){
  propertyPanel.classList.add("hidden");
}
qs("closePropertyBtn").addEventListener("click",()=>{selectedId=null;closeProperty();draw()});
qs("closeQuickBtn").addEventListener("click",()=>{
  opState=null;quickCreatedId=null;
  quickPanel.classList.add("hidden");
  qs("createByValueBtn").textContent="この寸法で作成";
});

qs("applyPropertyBtn").addEventListener("click",()=>{
  const s=selectedShape(); if(!s) return;
  if(qs("pLayer")) s.layer=ensureLayer(qs("pLayer").value.trim()||"0");
  if(s.type==="line"){
    s.x1=num(qs("pX1").value);s.y1=num(qs("pY1").value);s.x2=num(qs("pX2").value);s.y2=num(qs("pY2").value);
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
    s.mode=qs("pDimMode")?.value||s.mode||"aligned";
  }
  snapshot();openProperty(s);draw();hint.textContent="寸法を更新しました";
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
qs("deleteToolBtn").addEventListener("click",e=>{e.stopPropagation();deleteCurrentSelection();});

qs("layerBtn").addEventListener("click",()=>{
  qs("layerPanel").classList.toggle("hidden");
});
qs("closeLayerBtn").addEventListener("click",()=>qs("layerPanel").classList.add("hidden"));
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

qs("exportBtn").addEventListener("click",()=>{
  downloadText("2d-cad-drawing.json",JSON.stringify({
    version:VERSION,unit:"mm",shapes,drawingMeta,layerVisibility
  },null,2),"application/json");
});

qs("importBtn").addEventListener("click",()=>qs("importInput").click());
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
    if(s.type==="line"||s.type==="dim"){add(s.x1,s.y1);add(s.x2,s.y2);if(s.type==="dim")add(s.tx,s.ty)}
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

function svgShape(s,b,m){
  const stroke='stroke="#111" stroke-width="0.35" fill="none" vector-effect="non-scaling-stroke"';
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
    const a=svgPoint(s.x1,s.y1,b,m),d=svgPoint(s.x2,s.y2,b,m),q=svgPoint(s.tx,s.ty,b,m),mode=s.mode||"aligned";
    let oa,ob,value;
    if(mode==="horizontal"){oa={x:a.x,y:q.y};ob={x:d.x,y:q.y};value=Math.abs(s.x2-s.x1)}
    else if(mode==="vertical"){oa={x:q.x,y:a.y};ob={x:q.x,y:d.y};value=Math.abs(s.y2-s.y1)}
    else{
      const vx=d.x-a.x,vy=d.y-a.y,len=Math.hypot(vx,vy)||1,nx=-vy/len,ny=vx/len,mid={x:(a.x+d.x)/2,y:(a.y+d.y)/2};
      const off=(q.x-mid.x)*nx+(q.y-mid.y)*ny;oa={x:a.x+nx*off,y:a.y+ny*off};ob={x:d.x+nx*off,y:d.y+ny*off};value=Math.hypot(s.x2-s.x1,s.y2-s.y1);
    }
    return `<g stroke="#555" stroke-width="0.25" fill="none"><line x1="${a.x}" y1="${a.y}" x2="${oa.x}" y2="${oa.y}"/><line x1="${d.x}" y1="${d.y}" x2="${ob.x}" y2="${ob.y}"/><line x1="${oa.x}" y1="${oa.y}" x2="${ob.x}" y2="${ob.y}"/></g><text x="${(oa.x+ob.x)/2}" y="${(oa.y+ob.y)/2-1.5}" font-size="3.5" text-anchor="middle" fill="#333">${round(value)} mm</text>`;
  }
  return "";
}
function buildSVG(){
  const b=exportBounds(),margin=10,framePad=5,titleH=22;
  const geomW=Math.max(30,b.maxX-b.minX),geomH=Math.max(20,b.maxY-b.minY);
  const w=geomW+margin*2,h=geomH+margin*2+titleH;
  const shapesSvg=shapes.filter(isShapeVisible).map(s=>svgShape(s,b,margin)).join("");
  const titleY=h-titleH;
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${w}mm" height="${h}mm" viewBox="0 0 ${w} ${h}">
<rect width="${w}" height="${h}" fill="white"/>
<rect x="${framePad}" y="${framePad}" width="${w-framePad*2}" height="${h-framePad*2}" fill="none" stroke="#111" stroke-width="0.4"/>
<g font-family="Arial, sans-serif">${shapesSvg}
<line x1="${framePad}" y1="${titleY}" x2="${w-framePad}" y2="${titleY}" stroke="#111" stroke-width="0.4"/>
<line x1="${w*0.55}" y1="${titleY}" x2="${w*0.55}" y2="${h-framePad}" stroke="#111" stroke-width="0.3"/>
<text x="${framePad+3}" y="${titleY+7}" font-size="5" font-weight="bold">${xmlEscape(drawingMeta.title||"加工図")}</text>
<text x="${framePad+3}" y="${titleY+14}" font-size="3.5">図番: ${xmlEscape(drawingMeta.drawingNo||"-")}</text>
<text x="${w*0.55+3}" y="${titleY+7}" font-size="3.5">尺度: ${xmlEscape(drawingMeta.scale||"1:1")}</text>
<text x="${w*0.55+3}" y="${titleY+14}" font-size="3.5">作成者: ${xmlEscape(drawingMeta.author||"-")}</text>
</g></svg>`;
}
function printDrawing(){
  const svg=buildSVG();
  const win=window.open("","_blank");
  if(!win){alert("ポップアップを許可してください");return;}
  win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${xmlEscape(drawingMeta.title||"加工図")}</title><style>body{margin:0;display:grid;place-items:center;background:#fff}svg{max-width:100vw;max-height:100vh}@media print{svg{width:100%;height:auto}}</style></head><body>${svg.replace(/^<\?xml[^>]*>\s*/,"")}<script>window.onload=()=>setTimeout(()=>window.print(),150)<\/script></body></html>`);
  win.document.close();
}

function dxfPair(code,value){return `${code}\n${value}\n`}
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

qs("dxfImportBtn").addEventListener("click",()=>qs("dxfInput").click());
qs("dxfInput").addEventListener("change",async e=>{
  const f=e.target.files?.[0];if(!f)return;
  try{
    const imported=parseDXF(await f.text());
    if(!imported.length)throw new Error("no supported entities");
    shapes.push(...imported);snapshot();fitView();hint.textContent="DXFを読み込みました: "+imported.length+"要素";
  }catch(err){alert("DXFを読み込めませんでした。対応: LINE / CIRCLE / ARC / LWPOLYLINE");}
  e.target.value="";
});

qs("dxfBtn").addEventListener("click",()=>downloadText("2d-cad-drawing.dxf",toDXF(),"application/dxf"));
qs("svgBtn").addEventListener("click",()=>downloadText("2d-cad-drawing.svg",buildSVG(),"image/svg+xml"));
qs("printBtn").addEventListener("click",printDrawing);
qs("sheetBtn").addEventListener("click",()=>{syncSheetInputs();qs("sheetPanel").classList.remove("hidden")});
qs("closeSheetBtn").addEventListener("click",()=>qs("sheetPanel").classList.add("hidden"));
qs("saveSheetBtn").addEventListener("click",()=>{
  drawingMeta={
    title:qs("sheetTitle").value.trim()||"加工図",
    drawingNo:qs("sheetNo").value.trim(),
    scale:qs("sheetScale").value.trim()||"1:1",
    author:qs("sheetName").value.trim()
  };
  autoSave();qs("sheetPanel").classList.add("hidden");hint.textContent="図枠設定を保存しました";
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
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  });
}
