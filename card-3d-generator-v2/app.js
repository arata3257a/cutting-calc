const $ = id => document.getElementById(id);

const state = {
  originalFile: null,
  originalUrl: "",
  front: "",
  left: "",
  right: "",
  back: "",
  apiBase: localStorage.getItem("ai3d_api_base") || "",
  resultUrl: "",
  autoTimer: null
};

const stages = ["upload","extract","multiview","build"];
const stageEls = Object.fromEntries(stages.map(s => [s, $("stage-" + s)]));
const stepEls = [...document.querySelectorAll(".step")];

function go(stage){
  for(const [name,el] of Object.entries(stageEls)) el.classList.toggle("active", name === stage);
  stepEls.forEach(el => el.classList.toggle("active", el.dataset.step === stage));
  window.scrollTo({top:0,behavior:"smooth"});
}

stepEls.forEach(btn => btn.addEventListener("click", () => {
  const target = btn.dataset.step;
  if(target === "upload") return go(target);
  if(target === "extract" && state.originalUrl) return go(target);
  if(target === "multiview" && state.front) return go(target);
  if(target === "build" && state.front) return go(target);
}));

document.querySelectorAll(".back").forEach(btn => btn.addEventListener("click",()=>go(btn.dataset.target)));

const frontInput = $("frontInput");
const frontPreview = $("frontPreview");
const frontPreviewWrap = $("frontPreviewWrap");
const toExtractBtn = $("toExtractBtn");
const canvas = $("cropCanvas");
const ctx = canvas.getContext("2d");
const scaleEl = $("cropScale");
const xEl = $("cropX");
const yEl = $("cropY");
let imageObj = null;

frontInput.addEventListener("change", async e => {
  const file = e.target.files?.[0];
  if(!file) return;
  state.originalFile = file;
  if(state.originalUrl) URL.revokeObjectURL(state.originalUrl);
  state.originalUrl = URL.createObjectURL(file);
  frontPreview.src = state.originalUrl;
  frontPreviewWrap.classList.remove("empty");
  toExtractBtn.disabled = false;
  imageObj = await loadImage(state.originalUrl);
  resetCrop();
  drawCrop();
});

toExtractBtn.addEventListener("click",()=>go("extract"));

function loadImage(src){
  return new Promise((resolve,reject)=>{
    const img = new Image();
    img.onload=()=>resolve(img);
    img.onerror=reject;
    img.src=src;
  });
}

function resetCrop(){
  scaleEl.value="1";
  xEl.value="0";
  yEl.value="0";
}

function drawCrop(){
  if(!imageObj) return;
  const w=canvas.width,h=canvas.height;
  ctx.clearRect(0,0,w,h);
  ctx.fillStyle="#050a12";
  ctx.fillRect(0,0,w,h);

  const base=Math.max(w/imageObj.width,h/imageObj.height);
  const scale=base*Number(scaleEl.value);
  const dw=imageObj.width*scale, dh=imageObj.height*scale;
  const x=(w-dw)/2 + Number(xEl.value)*w*.35;
  const y=(h-dh)/2 + Number(yEl.value)*h*.35;
  ctx.drawImage(imageObj,x,y,dw,dh);

  ctx.strokeStyle="rgba(52,217,255,.72)";
  ctx.lineWidth=4;
  ctx.strokeRect(3,3,w-6,h-6);
}

[scaleEl,xEl,yEl].forEach(el=>el.addEventListener("input",drawCrop));
$("resetCropBtn").addEventListener("click",()=>{resetCrop();drawCrop();});

$("confirmExtractBtn").addEventListener("click",()=>{
  state.front=canvas.toDataURL("image/jpeg",.9);
  $("viewFront").src=state.front;
  updateViews();
  go("multiview");
});

function fileInputToView(input,key,imgId){
  input.addEventListener("change", async e=>{
    const file=e.target.files?.[0];
    if(!file) return;
    const url=URL.createObjectURL(file);
    const data=await imageToDataUrl(url);
    URL.revokeObjectURL(url);
    state[key]=data;
    $(imgId).src=data;
    updateViews();
  });
}
fileInputToView($("leftInput"),"left","viewLeft");
fileInputToView($("rightInput"),"right","viewRight");
fileInputToView($("backInput"),"back","viewBack");

async function imageToDataUrl(url){
  const img=await loadImage(url);
  const c=document.createElement("canvas");
  const max=900;
  const s=Math.min(1,max/Math.max(img.width,img.height));
  c.width=Math.max(1,Math.round(img.width*s));
  c.height=Math.max(1,Math.round(img.height*s));
  c.getContext("2d").drawImage(img,0,0,c.width,c.height);
  return c.toDataURL("image/jpeg",.9);
}

const order=["front","right","back","left"];
let turnIndex=0;
let dragStart=null;

function availableViews(){
  return order.filter(k=>Boolean(state[k]));
}
function updateViews(){
  ["front","left","right","back"].forEach(k=>{
    const img=$("view"+k[0].toUpperCase()+k.slice(1));
    if(state[k] && img.src!==state[k]) img.src=state[k];
  });
  const av=availableViews();
  $("autoRotateBtn").disabled=av.length<2;
  $("toBuildBtn").disabled=!state.front;
  showTurntable(av.includes(order[turnIndex]) ? order[turnIndex] : (av[0]||"front"));
}
function showTurntable(key){
  if(!state[key]) return;
  turnIndex=order.indexOf(key);
  $("turntableImg").src=state[key];
  $("turntableLabel").textContent=key.toUpperCase();
}
function hasFourViews(){ return Boolean(state.front&&state.left&&state.right&&state.back); }

const tt=$("turntableArea");
tt.addEventListener("pointerdown",e=>{dragStart=e.clientX;tt.setPointerCapture(e.pointerId);});
tt.addEventListener("pointerup",e=>{
  if(dragStart===null) return;
  const dx=e.clientX-dragStart;
  dragStart=null;
  if(Math.abs(dx)<30) return;
  const dir=dx<0?1:-1;
  for(let n=1;n<=4;n++){
    const idx=(turnIndex+dir*n+4)%4;
    if(state[order[idx]]){showTurntable(order[idx]);break;}
  }
});

$("autoRotateBtn").addEventListener("click",()=>{
  if(state.autoTimer){
    clearInterval(state.autoTimer); state.autoTimer=null;
    $("autoRotateBtn").textContent="自動回転"; return;
  }
  $("autoRotateBtn").textContent="停止";
  state.autoTimer=setInterval(()=>{
    for(let n=1;n<=4;n++){
      const idx=(turnIndex+n)%4;
      if(state[order[idx]]){showTurntable(order[idx]);break;}
    }
  },650);
});

$("toBuildBtn").addEventListener("click",()=>go("build"));

const apiBase=$("apiBase");
const apiStatus=$("apiStatus");
apiBase.value=state.apiBase;
refreshApiUi();

$("saveApiBtn").addEventListener("click",()=>{
  state.apiBase=apiBase.value.trim().replace(/\/$/,"");
  localStorage.setItem("ai3d_api_base",state.apiBase);
  refreshApiUi();
});

$("testApiBtn").addEventListener("click",async()=>{
  const base=apiBase.value.trim().replace(/\/$/,"");
  if(!base){apiStatus.textContent="URLを入力してください";return;}
  apiStatus.textContent="確認中...";
  try{
    const res=await fetch(base+"/health",{method:"GET"});
    if(!res.ok) throw new Error("HTTP "+res.status);
    apiStatus.textContent="接続OK";
    state.apiBase=base;
    localStorage.setItem("ai3d_api_base",base);
  }catch(err){
    apiStatus.textContent="接続できません："+err.message;
  }
  refreshApiUi();
});

function refreshApiUi(){
  const connected=Boolean(state.apiBase);
  $("aiExtractBtn").disabled=!connected||!state.originalUrl;
  $("generateViewsBtn").disabled=!connected||!state.front;
  $("build3dBtn").disabled=!connected||!state.front;
  if(!connected) apiStatus.textContent="未接続";
  else if(apiStatus.textContent==="未接続") apiStatus.textContent="URL保存済み（未確認）";
}

$("aiExtractBtn").addEventListener("click",async()=>{
  if(!state.apiBase||!state.originalFile) return;
  setButtonBusy($("aiExtractBtn"),true,"AI切り抜き中...");
  try{
    const original=await fileToDataUrl(state.originalFile);
    const data=await postJson("/extract",{image:original});
    const src=data.image||data.imageUrl;
    if(!src) throw new Error("画像が返ってきませんでした");
    imageObj=await loadImage(src);
    resetCrop();drawCrop();
  }catch(err){
    alert("AI切り抜きに失敗しました："+err.message);
  }finally{
    setButtonBusy($("aiExtractBtn"),false,"AI切り抜き（API）");
  }
});

$("generateViewsBtn").addEventListener("click",async()=>{
  if(!state.apiBase||!state.front) return;
  setButtonBusy($("generateViewsBtn"),true,"3方向を生成中...");
  $("multiHint").textContent="AIが左・右・背面を生成しています。";
  try{
    const data=await postJson("/multiview",{front:state.front});
    state.left=data.left||"";
    state.right=data.right||"";
    state.back=data.back||"";
    if(!hasFourViews()) throw new Error("3方向の画像がそろいませんでした");
    updateViews();
    $("multiHint").textContent="4方向がそろいました。3D生成へ進めます。";
  }catch(err){
    $("multiHint").textContent="生成に失敗しました："+err.message;
  }finally{
    setButtonBusy($("generateViewsBtn"),false,"AIで左・右・背面を生成（次段階）");
  }
});

$("build3dBtn").addEventListener("click",async()=>{
  if(!state.apiBase||!state.front) return;
  const btn=$("build3dBtn");
  setButtonBusy(btn,true,"3D生成を開始中...");
  $("buildStatus").textContent="送信中";
  $("buildDetail").textContent=hasFourViews()?"4方向画像をTRELLISへ送っています。":"正面1枚をTRELLISへ送っています。見えない面はAIが推定します。";
  $("buildProgress").value=3;
  try{
    const data=await postJson("/reconstruct",{
      front:state.front,left:state.left,right:state.right,back:state.back
    });
    const jobId=data.jobId||data.id;
    if(!jobId) throw new Error("jobIdがありません");
    await pollJob(jobId);
  }catch(err){
    $("buildStatus").textContent="生成失敗";
    $("buildDetail").textContent=err.message;
    $("buildProgress").value=0;
    btn.disabled=false;
    btn.textContent="3D生成を再試行";
  }
});

async function pollJob(jobId){
  for(let i=0;i<180;i++){
    const res=await fetch(state.apiBase+"/jobs/"+encodeURIComponent(jobId));
    if(!res.ok) throw new Error("進捗取得エラー："+res.status);
    const job=await res.json();
    const p=Math.max(0,Math.min(100,Number(job.progress||0)));
    $("buildProgress").value=p;
    $("buildStatus").textContent=job.status==="queued"?"待機中":"3D生成中";
    $("buildDetail").textContent="進捗 "+p+"%";
    if(job.status==="completed"){
      state.resultUrl=job.resultUrl||job.glbUrl||job.url||"";
      if(!state.resultUrl) throw new Error("GLB URLがありません");
      $("buildProgress").value=100;
      $("buildStatus").textContent="完成";
      $("buildDetail").textContent="3Dモデルの生成が完了しました。";
      $("resultText").textContent="GLB形式で保存できます。";
      $("glbLink").href=state.resultUrl;
      $("resultBox").hidden=false;
      $("build3dBtn").hidden=true;
      return;
    }
    if(job.status==="failed") throw new Error(job.error||"3D生成に失敗しました");
    await sleep(2000);
  }
  throw new Error("生成待ちがタイムアウトしました");
}

async function postJson(path,payload){
  const res=await fetch(state.apiBase+path,{
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify(payload)
  });
  if(!res.ok){
    const txt=await res.text().catch(()=>"");
    throw new Error("HTTP "+res.status+(txt?": "+txt.slice(0,120):""));
  }
  return res.json();
}

function fileToDataUrl(file){
  return new Promise((resolve,reject)=>{
    const r=new FileReader();
    r.onload=()=>resolve(String(r.result));
    r.onerror=reject;
    r.readAsDataURL(file);
  });
}
function sleep(ms){return new Promise(r=>setTimeout(r,ms));}
function setButtonBusy(btn,busy,text){
  btn.disabled=busy;
  btn.textContent=text;
  if(!busy) refreshApiUi();
}

$("newProjectBtn").addEventListener("click",()=>location.reload());

let deferredPrompt=null;
window.addEventListener("beforeinstallprompt",e=>{
  e.preventDefault();deferredPrompt=e;$("installBtn").hidden=false;
});
$("installBtn").addEventListener("click",async()=>{
  if(!deferredPrompt)return;
  deferredPrompt.prompt();
  await deferredPrompt.userChoice;
  deferredPrompt=null;$("installBtn").hidden=true;
});
if("serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js").catch(()=>{});

refreshApiUi();
go("upload");
