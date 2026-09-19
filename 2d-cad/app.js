const canvas = document.getElementById("cadCanvas");
const ctx = canvas.getContext("2d");
const hint = document.getElementById("hint");
const quickPanel = document.getElementById("quickPanel");
const propertyPanel = document.getElementById("propertyPanel");
const quickFields = document.getElementById("quickFields");
const propertyFields = document.getElementById("propertyFields");

const STORAGE_KEY = "easy-2d-cad-drawing-v2";
const VERSION = 2;

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

const qs = id => document.getElementById(id);
const num = v => Number.isFinite(Number(v)) ? Number(v) : 0;
const round = (v,d=2) => Number(v.toFixed(d));
const newId = () => nextId++;
const selectedShape = () => shapes.find(s => s.id === selectedId) || null;

function shapeLabel(type){
  return {line:"直線",rect:"四角",circle:"円",slot:"長穴"}[type] || type;
}

function snapValue(v){
  const step = num(qs("snapSelect").value) || 1;
  return Math.round(v / step) * step;
}

function snapPoint(p){
  return {x:snapValue(p.x),y:snapValue(p.y)};
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
  selectedId=null;start=null;preview=null;drag=null;
  closeProperty();
  draw();
  autoSave();
}

function autoSave(){
  localStorage.setItem(STORAGE_KEY,JSON.stringify({
    version:VERSION,unit:"mm",nextId,shapes
  }));
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
  const selected = !isPreview && s.id===selectedId;
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
    const a=worldToScreen({x:s.x,y:s.y});
    const b=worldToScreen({x:s.x+s.w,y:s.y+s.h});
    const left=Math.min(a.x,b.x), top=Math.min(a.y,b.y);
    ctx.strokeRect(left,top,Math.abs(b.x-a.x),Math.abs(b.y-a.y));
    drawDimensionText(`${round(Math.abs(s.w))} × ${round(Math.abs(s.h))} mm`,
      left+Math.abs(b.x-a.x)/2,top-7,selected);
  }

  if(s.type==="circle"){
    const c=worldToScreen({x:s.cx,y:s.cy});
    ctx.beginPath();ctx.arc(c.x,c.y,Math.abs(s.r*scale),0,Math.PI*2);ctx.stroke();
    drawDimensionText(`Ø${round(Math.abs(s.r*2))}`,c.x,c.y-Math.abs(s.r*scale)-7,selected);
  }

  if(s.type==="slot"){
    drawSlotPath(s);
    ctx.stroke();
    drawDimensionText(`${round(s.length)} × ${round(s.width)} mm`,
      worldToScreen({x:s.cx,y:s.cy+s.width/2}).x,
      worldToScreen({x:s.cx,y:s.cy+s.width/2}).y-7,selected);
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

function draw(){
  const r=canvas.getBoundingClientRect();
  ctx.clearRect(0,0,r.width,r.height);
  drawGrid(r.width,r.height);
  shapes.forEach(s=>drawShape(s));
  if(preview) drawShape(preview,true);
}

function shapeFromPoints(a,b){
  if(tool==="line") return {id:newId(),type:"line",x1:a.x,y1:a.y,x2:b.x,y2:b.y};
  if(tool==="rect") return {id:newId(),type:"rect",x:a.x,y:a.y,w:b.x-a.x,h:b.y-a.y};
  if(tool==="circle"){
    return {id:newId(),type:"circle",cx:a.x,cy:a.y,r:Math.max(.1,Math.hypot(b.x-a.x,b.y-a.y))};
  }
  if(tool==="slot"){
    const cx=(a.x+b.x)/2, cy=(a.y+b.y)/2;
    return {id:newId(),type:"slot",cx,cy,length:Math.max(Math.abs(b.x-a.x),Math.abs(b.y-a.y)),width:Math.min(Math.abs(b.x-a.x),Math.abs(b.y-a.y))};
  }
  return null;
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
  if(s.type==="rect"){
    const x1=Math.min(s.x,s.x+s.w)-tol,x2=Math.max(s.x,s.x+s.w)+tol;
    const y1=Math.min(s.y,s.y+s.h)-tol,y2=Math.max(s.y,s.y+s.h)+tol;
    return p.x>=x1&&p.x<=x2&&p.y>=y1&&p.y<=y2;
  }
  if(s.type==="slot"){
    const halfL=s.length/2+tol, halfW=s.width/2+tol;
    return Math.abs(p.x-s.cx)<=halfL && Math.abs(p.y-s.cy)<=halfW;
  }
  return false;
}

function hitTest(p){
  for(let i=shapes.length-1;i>=0;i--){
    if(hitShape(shapes[i],p)) return shapes[i];
  }
  return null;
}

function translateShape(s,dx,dy){
  if(s.type==="line"){s.x1+=dx;s.y1+=dy;s.x2+=dx;s.y2+=dy}
  if(s.type==="rect"){s.x+=dx;s.y+=dy}
  if(s.type==="circle"){s.cx+=dx;s.cy+=dy}
  if(s.type==="slot"){s.cx+=dx;s.cy+=dy}
}

canvas.addEventListener("pointerdown",e=>{
  canvas.setPointerCapture?.(e.pointerId);
  const raw=eventWorld(e);
  const p=snapPoint(raw);

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
  const raw=eventWorld(e);
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
    preview=shapeFromPoints(start,p);
    if(preview) preview.id=-1;
    draw();
  }
});

canvas.addEventListener("pointerup",()=>{
  if(tool==="select" && drag){
    const s=selectedShape();
    if(s){
      if(s.type==="line"){
        s.x1=snapValue(s.x1);s.y1=snapValue(s.y1);s.x2=snapValue(s.x2);s.y2=snapValue(s.y2);
      }else if(s.type==="rect"){
        s.x=snapValue(s.x);s.y=snapValue(s.y);
      }else{
        s.cx=snapValue(s.cx);s.cy=snapValue(s.cy);
      }
      snapshot();openProperty(s);
    }
    drag=null;draw();
  }
});

function setTool(next){
  tool=next;start=null;preview=null;drag=null;
  document.querySelectorAll(".tool").forEach(b=>b.classList.toggle("active",b.dataset.tool===tool));
  selectedId=null;closeProperty();
  if(tool==="select"){
    quickPanel.classList.add("hidden");
    hint.textContent="図形をタップして選択できます";
  }else{
    openQuick(tool);
    hint.textContent="始点をタップ、または数値入力";
  }
  draw();
}

document.querySelectorAll(".tool").forEach(btn=>btn.addEventListener("click",()=>setTool(btn.dataset.tool)));

function field(name,label,value=0,step="any"){
  return `<div class="field"><label for="${name}">${label}</label><input id="${name}" type="number" inputmode="decimal" step="${step}" value="${round(num(value))}"></div>`;
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
  if(type==="slot"){
    quickFields.innerHTML=field("qX","中心 X",0)+field("qY","中心 Y",0)+field("qLength","全長",40)+field("qW","幅",10);
  }
  quickPanel.classList.remove("hidden");
}

qs("createByValueBtn").addEventListener("click",()=>{
  let s=null;
  const x=num(qs("qX")?.value),y=num(qs("qY")?.value);
  if(tool==="line"){
    const length=Math.abs(num(qs("qLength").value));
    const angle=num(qs("qAngle").value)*Math.PI/180;
    s={id:newId(),type:"line",x1:x,y1:y,x2:x+length*Math.cos(angle),y2:y+length*Math.sin(angle)};
  }
  if(tool==="rect"){
    s={id:newId(),type:"rect",x,y,w:num(qs("qW").value),h:num(qs("qH").value)};
  }
  if(tool==="circle"){
    s={id:newId(),type:"circle",cx:x,cy:y,r:Math.abs(num(qs("qD").value))/2};
  }
  if(tool==="slot"){
    s={id:newId(),type:"slot",cx:x,cy:y,length:Math.abs(num(qs("qLength").value)),width:Math.abs(num(qs("qW").value))};
  }
  if(!s) return;
  shapes.push(s);selectedId=s.id;snapshot();fitView();draw();
  hint.textContent=`${shapeLabel(s.type)}を作成しました`;
});

function openProperty(s){
  quickPanel.classList.add("hidden");
  propertyPanel.classList.remove("hidden");
  let html=`<div class="field"><label>種類</label><input value="${shapeLabel(s.type)}" disabled></div>`;
  if(s.type==="line"){
    html+=field("pX1","始点 X",s.x1)+field("pY1","始点 Y",s.y1)+field("pX2","終点 X",s.x2)+field("pY2","終点 Y",s.y2);
  }
  if(s.type==="rect"){
    html+=field("pX","左下 X",s.x)+field("pY","左下 Y",s.y)+field("pW","幅",s.w)+field("pH","高さ",s.h);
  }
  if(s.type==="circle"){
    html+=field("pCX","中心 X",s.cx)+field("pCY","中心 Y",s.cy)+field("pD","直径 Ø",s.r*2);
  }
  if(s.type==="slot"){
    html+=field("pCX","中心 X",s.cx)+field("pCY","中心 Y",s.cy)+field("pLength","全長",s.length)+field("pW","幅",s.width);
  }
  propertyFields.innerHTML=html;
}

function closeProperty(){
  propertyPanel.classList.add("hidden");
}
qs("closePropertyBtn").addEventListener("click",()=>{selectedId=null;closeProperty();draw()});
qs("closeQuickBtn").addEventListener("click",()=>quickPanel.classList.add("hidden"));

qs("applyPropertyBtn").addEventListener("click",()=>{
  const s=selectedShape(); if(!s) return;
  if(s.type==="line"){
    s.x1=num(qs("pX1").value);s.y1=num(qs("pY1").value);s.x2=num(qs("pX2").value);s.y2=num(qs("pY2").value);
  }
  if(s.type==="rect"){
    s.x=num(qs("pX").value);s.y=num(qs("pY").value);s.w=num(qs("pW").value);s.h=num(qs("pH").value);
  }
  if(s.type==="circle"){
    s.cx=num(qs("pCX").value);s.cy=num(qs("pCY").value);s.r=Math.abs(num(qs("pD").value))/2;
  }
  if(s.type==="slot"){
    s.cx=num(qs("pCX").value);s.cy=num(qs("pCY").value);s.length=Math.abs(num(qs("pLength").value));s.width=Math.abs(num(qs("pW").value));
  }
  snapshot();openProperty(s);draw();hint.textContent="寸法を更新しました";
});

qs("deleteSelectedBtn").addEventListener("click",()=>{
  if(selectedId===null) return;
  shapes=shapes.filter(s=>s.id!==selectedId);
  selectedId=null;closeProperty();snapshot();draw();hint.textContent="削除しました";
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
    if(s.type==="circle"){
      minX=Math.min(minX,s.cx-s.r);maxX=Math.max(maxX,s.cx+s.r);
      minY=Math.min(minY,s.cy-s.r);maxY=Math.max(maxY,s.cy+s.r);
    }
    if(s.type==="slot"){
      minX=Math.min(minX,s.cx-s.length/2);maxX=Math.max(maxX,s.cx+s.length/2);
      minY=Math.min(minY,s.cy-s.width/2);maxY=Math.max(maxY,s.cy+s.width/2);
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
qs("fitBtn").addEventListener("click",fitView);
qs("zoomInBtn").addEventListener("click",()=>{scale=Math.min(20,scale*1.25);draw()});
qs("zoomOutBtn").addEventListener("click",()=>{scale=Math.max(.3,scale/1.25);draw()});

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
  downloadText("2d-cad-drawing.json",JSON.stringify({version:VERSION,unit:"mm",shapes},null,2),"application/json");
});

qs("importBtn").addEventListener("click",()=>qs("importInput").click());
qs("importInput").addEventListener("change",async e=>{
  const f=e.target.files?.[0]; if(!f) return;
  try{
    const data=JSON.parse(await f.text());
    if(!Array.isArray(data.shapes)) throw new Error();
    shapes=data.shapes.map(s=>({...s,id:s.id??newId()}));
    nextId=Math.max(1,...shapes.map(s=>num(s.id)+1));
    selectedId=null;snapshot();fitView();hint.textContent="図面を読み込みました";
  }catch{alert("このJSONファイルは読み込めませんでした")}
  e.target.value="";
});

qs("sampleBtn").addEventListener("click",async()=>{
  try{
    const r=await fetch("./data/drawing.json",{cache:"no-store"});
    const data=await r.json();
    shapes=(data.shapes||[]).map(convertOldShape).map(s=>({...s,id:newId()}));
    selectedId=null;snapshot();fitView();hint.textContent="サンプルを読み込みました";
  }catch{hint.textContent="サンプルを読み込めませんでした"}
});

function convertOldShape(s){
  if(s.type==="line") return {type:"line",x1:num(s.x1),y1:num(s.y1),x2:num(s.x2),y2:num(s.y2)};
  if(s.type==="rect" && "w" in s) return s;
  if(s.type==="rect") return {type:"rect",x:num(s.x1),y:num(s.y1),w:num(s.x2)-num(s.x1),h:num(s.y2)-num(s.y1)};
  if(s.type==="circle" && "r" in s) return s;
  if(s.type==="circle") return {type:"circle",cx:num(s.x1),cy:num(s.y1),r:Math.hypot(num(s.x2)-num(s.x1),num(s.y2)-num(s.y1))};
  return s;
}

function dxfPair(code,value){return `${code}\n${value}\n`}
function dxfLine(s){
  return dxfPair(0,"LINE")+dxfPair(8,0)+dxfPair(10,s.x1)+dxfPair(20,s.y1)+dxfPair(30,0)+dxfPair(11,s.x2)+dxfPair(21,s.y2)+dxfPair(31,0);
}
function dxfCircle(cx,cy,r){
  return dxfPair(0,"CIRCLE")+dxfPair(8,0)+dxfPair(10,cx)+dxfPair(20,cy)+dxfPair(30,0)+dxfPair(40,r);
}
function dxfArc(cx,cy,r,a1,a2){
  return dxfPair(0,"ARC")+dxfPair(8,0)+dxfPair(10,cx)+dxfPair(20,cy)+dxfPair(30,0)+dxfPair(40,r)+dxfPair(50,a1)+dxfPair(51,a2);
}
function toDXF(){
  let body="";
  for(const s of shapes){
    if(s.type==="line") body+=dxfLine(s);
    if(s.type==="circle") body+=dxfCircle(s.cx,s.cy,Math.abs(s.r));
    if(s.type==="rect"){
      const x2=s.x+s.w,y2=s.y+s.h;
      body+=dxfLine({x1:s.x,y1:s.y,x2,y2:s.y});
      body+=dxfLine({x1:x2,y1:s.y,x2,y2});
      body+=dxfLine({x1:x2,y1:y2,x2:s.x,y2});
      body+=dxfLine({x1:s.x,y1:y2,x2:s.x,y2:s.y});
    }
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
qs("dxfBtn").addEventListener("click",()=>downloadText("2d-cad-drawing.dxf",toDXF(),"application/dxf"));

try{
  const saved=JSON.parse(localStorage.getItem(STORAGE_KEY));
  if(saved && Array.isArray(saved.shapes)){
    shapes=saved.shapes;
    nextId=Math.max(1,...shapes.map(s=>num(s.id)+1));
  }
}catch{}

snapshot();
setTool("select");
window.addEventListener("resize",resize);
resize();
