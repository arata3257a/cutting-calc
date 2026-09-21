
let pipelinePromise=null;
let libPromise=null;

function emit(cb,message,progress=null){
  try{ cb?.({message,progress}); }catch{}
}

async function loadLib(){
  if(!libPromise){
    libPromise=import("https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1")
      .then(mod=>{
        mod.env.allowLocalModels=false;
        return mod;
      })
      .catch(err=>{libPromise=null;throw err;});
  }
  return libPromise;
}

async function getPipeline(progressCb){
  if(!pipelinePromise){
    pipelinePromise=(async()=>{
      const {pipeline}=await loadLib();
      emit(progressCb,"手書きAIを準備しています…",0);
      return pipeline(
        "image-to-text",
        "Xenova/trocr-small-handwritten",
        {
          dtype:"q8",
          device:"wasm",
          progress_callback:p=>{
            if(!p) return;
            if(p.status==="progress" && Number.isFinite(p.progress)){
              emit(progressCb,"手書きAIを初回準備中… "+Math.round(p.progress)+"%",p.progress);
            }else if(p.status==="ready"){
              emit(progressCb,"手書きAIの準備完了",100);
            }else if(p.status){
              emit(progressCb,"手書きAI: "+p.status,null);
            }
          }
        }
      );
    })().catch(err=>{pipelinePromise=null;throw err;});
  }
  return pipelinePromise;
}

function canvasToPng(canvas){
  return canvas.toDataURL("image/png");
}

function clean(text){
  return String(text||"")
    .replace(/[|]/g,"1")
    .replace(/[Oo](?=\d)/g,"0")
    .replace(/[ØøΦφ⌀]/g,"D")
    .replace(/\s+/g," ")
    .trim();
}

function tokens(text){
  const s=clean(text);
  const out=[];
  const re=/(?:M\s*\d+(?:\.\d+)?|D\s*\d+(?:\.\d+)?|R\s*\d+(?:\.\d+)?|\d+(?:\.\d+)?)/gi;
  for(const m of s.matchAll(re)){
    const raw=m[0].replace(/\s+/g,"");
    let kind="plain",value=null;
    if(/^M/i.test(raw)){kind="thread";value=Number(raw.slice(1));}
    else if(/^D/i.test(raw)){kind="diameter";value=Number(raw.slice(1));}
    else if(/^R/i.test(raw)){kind="radius";value=Number(raw.slice(1));}
    else value=Number(raw);
    if(Number.isFinite(value) && value>0 && value<100000){
      out.push({kind,value,raw});
    }
  }
  return out;
}

async function readCanvas(canvas,progressCb,options={}){
  const pipe=await getPipeline(progressCb);
  emit(progressCb,options.label||"手書き寸法をAIで確認しています…",null);
  const output=await pipe(canvasToPng(canvas),{
    max_new_tokens:options.max_new_tokens||16,
    num_beams:options.num_beams||2,
    do_sample:false
  });
  const text=clean(output?.[0]?.generated_text||"");
  return {text,tokens:tokens(text)};
}

window.HandwritingAI={
  readCanvas,
  tokens,
  warmup:(cb)=>getPipeline(cb).then(()=>true),
  isLoaded:()=>!!pipelinePromise
};
