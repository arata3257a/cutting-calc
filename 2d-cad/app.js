const canvas = document.getElementById("cadCanvas");
const ctx = canvas.getContext("2d");
const hint = document.getElementById("hint");

const STORAGE_KEY = "easy-2d-cad-drawing-v1";
let tool = "line";
let start = null;
let preview = null;
let shapes = [];

function resize(){
  const r = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.round(r.width * dpr));
  canvas.height = Math.max(1, Math.round(r.height * dpr));
  ctx.setTransform(dpr,0,0,dpr,0,0);
  draw();
}

function pos(e){
  const r = canvas.getBoundingClientRect();
  return {x:e.clientX-r.left,y:e.clientY-r.top};
}

function drawGrid(w,h){
  ctx.save();
  ctx.strokeStyle="#edf0f3";
  ctx.lineWidth=1;
  const step=20;
  for(let x=0;x<w;x+=step){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,h);ctx.stroke()}
  for(let y=0;y<h;y+=step){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(w,y);ctx.stroke()}
  ctx.restore();
}

function drawShape(s, isPreview=false){
  ctx.save();
  ctx.strokeStyle=isPreview ? "#6b7480" : "#111820";
  ctx.lineWidth=isPreview ? 1.5 : 2;
  if(isPreview) ctx.setLineDash([6,5]);

  if(s.type==="line"){
    ctx.beginPath();ctx.moveTo(s.x1,s.y1);ctx.lineTo(s.x2,s.y2);ctx.stroke();
  }
  if(s.type==="rect"){
    ctx.strokeRect(s.x1,s.y1,s.x2-s.x1,s.y2-s.y1);
  }
  if(s.type==="circle"){
    const r=Math.hypot(s.x2-s.x1,s.y2-s.y1);
    ctx.beginPath();ctx.arc(s.x1,s.y1,r,0,Math.PI*2);ctx.stroke();
  }
  ctx.restore();
}

function draw(){
  const r=canvas.getBoundingClientRect();
  ctx.clearRect(0,0,r.width,r.height);
  drawGrid(r.width,r.height);
  shapes.forEach(s=>drawShape(s));
  if(preview) drawShape(preview,true);
}

function shapeFrom(a,b){
  return {type:tool,x1:a.x,y1:a.y,x2:b.x,y2:b.y};
}

canvas.addEventListener("pointerdown",e=>{
  canvas.setPointerCapture?.(e.pointerId);
  const p=pos(e);
  if(!start){
    start=p;
    hint.textContent="終点をタップしてください";
  }else{
    shapes.push(shapeFrom(start,p));
    start=null;
    preview=null;
    hint.textContent="始点をタップしてください";
    draw();
  }
});

canvas.addEventListener("pointermove",e=>{
  if(!start) return;
  preview=shapeFrom(start,pos(e));
  draw();
});

document.querySelectorAll(".tool").forEach(btn=>{
  btn.addEventListener("click",()=>{
    document.querySelectorAll(".tool").forEach(b=>b.classList.remove("active"));
    btn.classList.add("active");
    tool=btn.dataset.tool;
    start=null;
    preview=null;
    hint.textContent="始点をタップしてください";
    draw();
  });
});

document.getElementById("undoBtn").addEventListener("click",()=>{
  if(start){start=null;preview=null}
  else shapes.pop();
  draw();
});

document.getElementById("clearBtn").addEventListener("click",()=>{
  if(confirm("図形をすべて消去しますか？")){
    shapes=[];start=null;preview=null;draw();
  }
});

document.getElementById("saveBtn").addEventListener("click",()=>{
  localStorage.setItem(STORAGE_KEY,JSON.stringify({version:1,shapes}));
  hint.textContent="端末に保存しました";
  setTimeout(()=>hint.textContent="始点をタップしてください",1200);
});

document.getElementById("exportBtn").addEventListener("click",()=>{
  const data=JSON.stringify({version:1,shapes},null,2);
  const blob=new Blob([data],{type:"application/json"});
  const a=document.createElement("a");
  a.href=URL.createObjectURL(blob);
  a.download="2d-cad-drawing.json";
  a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href),1000);
});

document.getElementById("sampleBtn").addEventListener("click",async()=>{
  try{
    const r=await fetch("./data/drawing.json",{cache:"no-store"});
    const data=await r.json();
    shapes=Array.isArray(data.shapes)?data.shapes:[];
    start=null;preview=null;draw();
  }catch{
    hint.textContent="サンプルを読み込めませんでした";
  }
});

try{
  const saved=JSON.parse(localStorage.getItem(STORAGE_KEY));
  if(saved && Array.isArray(saved.shapes)) shapes=saved.shapes;
}catch{}

window.addEventListener("resize",resize);
resize();
