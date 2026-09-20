const $=id=>document.getElementById(id);

const MODEL_BASE="https://huggingface.co/cgb/triposr-onnx-webgpu/resolve/main/";
const MODEL_URL=MODEL_BASE+"triplane_q8.onnx";
const DATA_URL=MODEL_BASE+"triplane_q8.onnx.data";
const DECODER_URL=MODEL_BASE+"decoder.onnx";

let adapter=null;
let device=null;
let triplaneSession=null;
let decoderSession=null;
let imageFile=null;
let imageUrl="";

function setBadge(id,text,kind="idle"){
  const el=$(id);
  el.textContent=text;
  el.className="status "+kind;
}
function setProgress(value,text){
  $("progress").value=value;
  $("progressText").textContent=text;
}
function browserLabel(){
  const ua=navigator.userAgent;
  if(/EdgA/i.test(ua))return "Edge Android";
  if(/Chrome/i.test(ua)&&/Android/i.test(ua))return "Chrome Android";
  if(/Chrome/i.test(ua))return "Chrome";
  return navigator.userAgentData?.brands?.[0]?.brand||"その他";
}

$("browserText").textContent=browserLabel();
$("memoryText").textContent=navigator.deviceMemory?navigator.deviceMemory+" GB (申告値)":"取得不可";

$("checkBtn").addEventListener("click",async()=>{
  setBadge("gpuBadge","確認中","loading");
  if(!navigator.gpu){
    $("webgpuText").textContent="非対応";
    setBadge("gpuBadge","非対応","bad");
    $("loadModelBtn").disabled=true;
    return;
  }
  try{
    adapter=await navigator.gpu.requestAdapter({powerPreference:"high-performance"});
    if(!adapter)throw new Error("GPU adapterなし");
    device=await adapter.requestDevice();
    $("webgpuText").textContent="対応";
    $("limitText").textContent=Math.round((device.limits.maxBufferSize||0)/1024/1024)+" MB";
    setBadge("gpuBadge","対応","ok");
    $("loadModelBtn").disabled=false;
  }catch(err){
    $("webgpuText").textContent="初期化失敗";
    $("limitText").textContent=String(err.message||err);
    setBadge("gpuBadge","失敗","bad");
  }
});

$("loadModelBtn").addEventListener("click",async()=>{
  if(!navigator.gpu)return;
  $("loadModelBtn").disabled=true;
  setBadge("modelBadge","読込み中","loading");
  try{
    if(!window.ort)throw new Error("ONNX Runtime Webの読込みに失敗");
    ort.env.wasm.numThreads=1;

    setProgress(5,"TripoSR本体を準備中（初回は大容量）");
    triplaneSession=await ort.InferenceSession.create(MODEL_URL,{
      executionProviders:["webgpu"],
      externalData:[{path:"triplane_q8.onnx.data",data:DATA_URL}],
      graphOptimizationLevel:"all"
    });

    setProgress(85,"デコーダーを読み込み中");
    decoderSession=await ort.InferenceSession.create(DECODER_URL,{
      executionProviders:["webgpu"],
      graphOptimizationLevel:"all"
    });

    setProgress(100,"モデル読込み成功");
    setBadge("modelBadge","ロード成功","ok");
    $("prepareBtn").disabled=!imageFile;
  }catch(err){
    console.error(err);
    setProgress(0,"読込み失敗: "+(err.message||err));
    setBadge("modelBadge","失敗","bad");
    $("loadModelBtn").disabled=false;
  }
});

$("imageInput").addEventListener("change",e=>{
  const f=e.target.files?.[0];
  if(!f)return;
  imageFile=f;
  if(imageUrl)URL.revokeObjectURL(imageUrl);
  imageUrl=URL.createObjectURL(f);
  $("preview").src=imageUrl;
  $("previewWrap").classList.remove("empty");
  $("prepareBtn").disabled=!(triplaneSession&&decoderSession);
});

$("prepareBtn").addEventListener("click",async()=>{
  if(!imageFile)return;
  const img=await loadImage(imageUrl);
  const c=$("prepCanvas"),x=c.getContext("2d");
  x.fillStyle="rgb(128,128,128)";
  x.fillRect(0,0,512,512);

  const ratio=Math.min(435/img.width,435/img.height);
  const w=img.width*ratio,h=img.height*ratio;
  x.drawImage(img,(512-w)/2,(512-h)/2,w,h);

  $("prepPreview").src=c.toDataURL("image/png");
  $("prepWrap").classList.remove("empty");
});

function loadImage(src){
  return new Promise((resolve,reject)=>{
    const img=new Image();
    img.onload=()=>resolve(img);
    img.onerror=reject;
    img.src=src;
  });
}

if("serviceWorker" in navigator)navigator.serviceWorker.register("./sw.js").catch(()=>{});
