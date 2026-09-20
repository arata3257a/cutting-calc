const $ = id => document.getElementById(id);

const isGithubPages = location.hostname.endsWith("github.io");
const autoLocalBase = (!isGithubPages && location.protocol === "http:") ? location.origin : "";

const state = {
  originalFile: null,
  originalUrl: "",
  preparedImage: "",
  localBase: localStorage.getItem("ai3d_local_base") || autoLocalBase,
  connected: false,
  resultUrl: ""
};

const stages=["upload","extract","build"];
const stageEls=Object.fromEntries(stages.map(s=>[s,$("stage-"+s)]));
const stepEls=[...document.querySelectorAll(".step")];

function go(stage){
  for(const [name,el] of Object.entries(stageEls)) el.classList.toggle("active",name===stage);
  stepEls.forEach(el=>el.classList.toggle("active",el.dataset.step===stage));
  scrollTo({top:0,behavior:"smooth"});
}
stepEls.forEach(btn=>btn.addEventListener("click",()=>{
  const target=btn.dataset.step;
  if(target==="upload") go(target);
  if(target==="extract"&&state.originalUrl) go(target);
  if(target==="build"&&state.preparedImage) go(target);
}));
document.querySelectorAll(".back").forEach(btn=>btn.addEventListener("click",()=>go(btn.dataset.target)));

const frontInput=$("frontInput");
const frontPreview=$("frontPreview");
const frontPreviewWrap=$("frontPreviewWrap");
const canvas=$("cropCanvas");
const ctx=canvas.getContext("2d");
const scaleEl=$("cropScale");
const xEl=$("cropX");
const yEl=$("cropY");
let imageObj=null;

frontInput.addEventListener("change",async e=>{
  const file=e.target.files?.[0];
  if(!file)return;
  state.originalFile=file;
  if(state.originalUrl)URL.revokeObjectURL(state.originalUrl);
  state.originalUrl=URL.createObjectURL(file);
  frontPreview.src=state.originalUrl;
  frontPreviewWrap.classList.remove("empty");
  $("toExtractBtn").disabled=false;
  imageObj=await loadImage(state.originalUrl);
  resetCrop();drawCrop();
  refreshButtons();
});

$("toExtractBtn").addEventListener("click",()=>go("extract"));

function loadImage(src){
  return new Promise((resolve,reject)=>{
    const img=new Image();
    img.onload=()=>resolve(img);
    img.onerror=reject;
    img.src=src;
  });
}
function resetCrop(){
  scaleEl.value="1";xEl.value="0";yEl.value="0";
}
function drawCrop(){
  if(!imageObj)return;
  const w=canvas.width,h=canvas.height;
  ctx.clearRect(0,0,w,h);
  ctx.fillStyle="#7f7f7f";
  ctx.fillRect(0,0,w,h);
  const base=Math.max(w/imageObj.width,h/imageObj.height);
  const scale=base*Number(scaleEl.value);
  const dw=imageObj.width*scale,dh=imageObj.height*scale;
  const x=(w-dw)/2+Number(xEl.value)*w*.38;
  const y=(h-dh)/2+Number(yEl.value)*h*.38;
  ctx.drawImage(imageObj,x,y,dw,dh);
  ctx.strokeStyle="rgba(52,217,255,.85)";
  ctx.lineWidth=4;
  ctx.strokeRect(3,3,w-6,h-6);
}
[scaleEl,xEl,yEl].forEach(el=>el.addEventListener("input",drawCrop));
$("resetCropBtn").addEventListener("click",()=>{resetCrop();drawCrop();});

$("confirmExtractBtn").addEventListener("click",()=>{
  state.preparedImage=canvas.toDataURL("image/png");
  go("build");
  refreshButtons();
});

const localBase=$("localBase");
const localStatus=$("localStatus");
localBase.value=state.localBase;
$("mixedWarning").hidden=!(isGithubPages);

$("saveLocalBtn").addEventListener("click",()=>{
  state.localBase=normalizeBase(localBase.value);
  localStorage.setItem("ai3d_local_base",state.localBase);
  state.connected=false;
  localStatus.textContent=state.localBase?"保存済み・未確認":"未設定";
  refreshButtons();
});

$("testLocalBtn").addEventListener("click",async()=>{
  const base=normalizeBase(localBase.value);
  if(!base){localStatus.textContent="PCのアドレスを入力してください";return;}
  localStatus.textContent="接続確認中...";
  try{
    const res=await fetch(base+"/health",{cache:"no-store"});
    if(!res.ok)throw new Error("HTTP "+res.status);
    const data=await res.json();
    state.localBase=base;
    state.connected=true;
    localStorage.setItem("ai3d_local_base",base);
    localStatus.textContent=data.ready===false
      ?"接続OK / TripoSR未準備"
      :"接続OK / 無料ローカル生成できます";
  }catch(err){
    state.connected=false;
    localStatus.textContent="接続できません："+err.message;
  }
  refreshButtons();
});

$("removeBgBtn").addEventListener("click",async()=>{
  if(!state.connected||!state.originalFile)return;
  setBusy($("removeBgBtn"),true,"背景除去中...");
  try{
    const original=await fileToDataUrl(state.originalFile);
    const data=await postJson("/extract",{image:original});
    const src=data.image||data.imageUrl;
    if(!src)throw new Error("画像が返ってきませんでした");
    imageObj=await loadImage(src);
    resetCrop();drawCrop();
  }catch(err){
    alert("背景除去に失敗しました："+err.message);
  }finally{
    setBusy($("removeBgBtn"),false,"背景を自動除去（PC）");
  }
});

$("build3dBtn").addEventListener("click",async()=>{
  if(!state.connected||!state.preparedImage)return;
  const btn=$("build3dBtn");
  setBusy(btn,true,"3D生成を開始中...");
  $("buildStatus").textContent="送信中";
  $("buildDetail").textContent="PCでTripoSRを起動しています。";
  $("buildProgress").value=3;
  try{
    const data=await postJson("/reconstruct",{front:state.preparedImage});
    const jobId=data.jobId||data.id;
    if(!jobId)throw new Error("jobIdがありません");
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
  for(let i=0;i<900;i++){
    const res=await fetch(state.localBase+"/jobs/"+encodeURIComponent(jobId),{cache:"no-store"});
    if(!res.ok)throw new Error("進捗取得エラー："+res.status);
    const job=await res.json();
    const p=Math.max(0,Math.min(100,Number(job.progress||0)));
    $("buildProgress").value=p;
    $("buildStatus").textContent=job.status==="queued"?"待機中":"3D生成中";
    $("buildDetail").textContent="進捗 "+p+"%";
    if(job.status==="completed"){
      state.resultUrl=job.resultUrl||job.glbUrl||job.url||"";
      if(!state.resultUrl)throw new Error("GLB URLがありません");
      $("buildProgress").value=100;
      $("buildStatus").textContent="完成";
      $("buildDetail").textContent="PCで3Dモデルを生成しました。";
      $("glbLink").href=state.resultUrl;
      $("resultBox").hidden=false;
      $("build3dBtn").hidden=true;
      return;
    }
    if(job.status==="failed")throw new Error(job.error||"3D生成に失敗しました");
    await sleep(2000);
  }
  throw new Error("生成待ちがタイムアウトしました");
}

async function postJson(path,payload){
  const res=await fetch(state.localBase+path,{
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify(payload)
  });
  if(!res.ok){
    let detail="";
    try{
      const data=await res.json();
      detail=data.detail?": "+data.detail:"";
    }catch{}
    throw new Error("HTTP "+res.status+detail);
  }
  return res.json();
}

function refreshButtons(){
  $("removeBgBtn").disabled=!state.connected||!state.originalFile;
  $("build3dBtn").disabled=!state.connected||!state.preparedImage;
  if(state.connected){
    $("buildStatus").textContent="生成できます";
    $("buildDetail").textContent="外部有料APIは使いません。PC内で処理します。";
  }
}
function normalizeBase(v){return String(v||"").trim().replace(/\/$/,"");}
function fileToDataUrl(file){
  return new Promise((resolve,reject)=>{
    const r=new FileReader();
    r.onload=()=>resolve(String(r.result));
    r.onerror=reject;
    r.readAsDataURL(file);
  });
}
function sleep(ms){return new Promise(r=>setTimeout(r,ms));}
function setBusy(btn,busy,text){
  btn.disabled=busy;
  btn.textContent=text;
  if(!busy)refreshButtons();
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
if("serviceWorker" in navigator)navigator.serviceWorker.register("./sw.js").catch(()=>{});

refreshButtons();
go("upload");
