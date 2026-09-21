
(() => {
  "use strict";

  const $ = id => document.getElementById(id);
  let ocrWorkerPromise=null;
  let engineWarmupPromise=null;

  const state = {
    imageReady:false,
    working:false,
    sourceW:0,
    sourceH:0,
    rect:null,
    circles:[],
    dims:[],
    rawText:"",
    width:null,
    height:null,
    holes:[],
    aiUsed:false,
    assistMode:null,
    assistPoints:[],
    assistHoleCenter:null,
    assistBusy:false,
    reliableMode:null,
    reliableCorners:[],
    reliableHoles:[],
    reliableH:null,
    fileName:""
  };

  function setStatus(message, kind=""){
    const el=$("handStatus");
    if(!el) return;
    el.textContent=message;
    el.dataset.kind=kind;
  }

  function setBusy(on){
    state.working=on;
    const ids=["handCameraBtn","handGalleryBtn","handRecognizeBtn","handApplyBtn","handPdfBtn","handDxfBtn"];
    ids.forEach(id=>{const el=$(id); if(el) el.disabled=!!on;});
  }

  function openPanel(){
    $("handDrawPanel")?.classList.remove("hidden");
    $("handReviewArea")?.classList.add("hidden");
    $("handPhotoArea")?.classList.toggle("hidden",!state.imageReady);
    setStatus(state.imageReady ? "撮影画像を確認して「この写真を読み取る」を押してください。" : "手書き図面を撮影してください。");
  }

  function closePanel(){
    $("handDrawPanel")?.classList.add("hidden");
  }

  function triggerCamera(){
    if(state.working) return;
    const input=$("handCameraInput");
    if(input){
      input.value="";
      input.click();
    }
  }

  function triggerGallery(){
    if(state.working) return;
    const input=$("handGalleryInput");
    if(input){
      input.value="";
      input.click();
    }
  }

  function loadImageFile(file){
    if(!file) return;
    state.fileName=(file.name||"hand-drawing").replace(/\.[^.]+$/,"");
    const url=URL.createObjectURL(file);
    const img=$("handPhotoPreview");
    img.onload=()=>{
      try{
        const maxSide=1000;
        const ratio=Math.min(1,maxSide/Math.max(img.naturalWidth||1,img.naturalHeight||1));
        const w=Math.max(1,Math.round(img.naturalWidth*ratio));
        const h=Math.max(1,Math.round(img.naturalHeight*ratio));
        const canvas=$("handSourceCanvas");
        canvas.width=w; canvas.height=h;
        const c=canvas.getContext("2d",{willReadFrequently:true});
        c.fillStyle="#fff";c.fillRect(0,0,w,h);
        c.drawImage(img,0,0,w,h);
        state.sourceW=w;state.sourceH=h;state.imageReady=true;
        state.rect=null;state.circles=[];state.dims=[];state.rawText="";
        state.width=null;state.height=null;state.holes=[];state.aiUsed=false;
        state.assistMode=null;state.assistPoints=[];state.assistHoleCenter=null;state.assistBusy=false;
        state.reliableMode=null;state.reliableCorners=[];state.reliableHoles=[];state.reliableH=null;
        $("handPhotoArea")?.classList.remove("hidden");
        $("handReviewArea")?.classList.add("hidden");
        setStatus("幅と高さを入力して進んでください。","ok");
        setTimeout(openReliable,0);
      }finally{
        URL.revokeObjectURL(url);
      }
    };
    img.onerror=()=>{
      URL.revokeObjectURL(url);
      setStatus("画像を開けませんでした。撮り直してください。","error");
    };
    img.src=url;
    openPanel();
  }

  function loadScriptOnce(id,src){
    return new Promise((resolve,reject)=>{
      const existing=document.getElementById(id);
      if(existing){
        if(existing.dataset.ready==="1") return resolve();
        existing.addEventListener("load",()=>resolve(),{once:true});
        existing.addEventListener("error",()=>reject(new Error("load failed")),{once:true});
        return;
      }
      const s=document.createElement("script");
      s.id=id;s.src=src;s.async=true;s.crossOrigin="anonymous";
      s.onload=()=>{s.dataset.ready="1";resolve();};
      s.onerror=()=>reject(new Error("load failed"));
      document.head.appendChild(s);
    });
  }

  async function getOpenCV(){
    if(!window.cv){
      await loadScriptOnce("hand-opencv","https://docs.opencv.org/4.x/opencv.js");
    }
    let lib=window.cv;
    if(lib && typeof lib.then==="function") lib=await lib;
    for(let i=0;i<80 && (!lib || !lib.Mat);i++){
      await new Promise(r=>setTimeout(r,100));
      lib=window.cv;
      if(lib && typeof lib.then==="function") lib=await lib;
    }
    if(!lib || !lib.Mat) throw new Error("OpenCVを起動できません");
    return lib;
  }

  async function getTesseract(){
    if(!window.Tesseract){
      await loadScriptOnce("hand-tesseract","https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js");
    }
    if(!window.Tesseract?.createWorker) throw new Error("文字認識を起動できません");
    return window.Tesseract;
  }

  function timeout(promise,ms,label){
    return Promise.race([
      promise,
      new Promise((_,reject)=>setTimeout(()=>reject(new Error(label||"処理がタイムアウトしました")),ms))
    ]);
  }

  async function getOcrWorker(){
    if(ocrWorkerPromise) return ocrWorkerPromise;
    ocrWorkerPromise=(async()=>{
      const T=await getTesseract();
      const worker=await T.createWorker("eng",1,{
        logger:m=>{
          if(m.status==="loading tesseract core") setStatus("文字認識エンジンを準備中…");
          else if(m.status==="loading language traineddata") setStatus("文字データを読み込み中…");
          else if(m.status==="initializing api") setStatus("文字認識を初期化中…");
        }
      });
      await worker.setParameters({
        tessedit_pageseg_mode:"11",
        preserve_interword_spaces:"1",
        tessedit_char_whitelist:"0123456789.-+xXRMrmDdOoØøΦφ⌀"
      });
      return worker;
    })().catch(err=>{ocrWorkerPromise=null;throw err;});
    return ocrWorkerPromise;
  }

  function warmupEngines(){
    if(engineWarmupPromise) return engineWarmupPromise;
    engineWarmupPromise=Promise.allSettled([
      timeout(getOpenCV(),15000,"図形認識の準備に時間がかかっています"),
      timeout(getOcrWorker(),15000,"文字認識の準備に時間がかかっています")
    ]);
    return engineWarmupPromise;
  }

  function clamp(v,min,max){return Math.max(min,Math.min(max,v));}
  function centerOfBox(b){return {x:(b.x0+b.x1)/2,y:(b.y0+b.y1)/2};}

  function detectGeometry(cv,targetAspect=null){
    const canvas=$("handSourceCanvas");
    const W=canvas.width,H=canvas.height;
    const mats=[];
    const keep=m=>{mats.push(m);return m;};
    let bestRect=null;
    let circleCandidates=[];
    let rectCandidates=[];
    try{
      const src=keep(cv.imread(canvas));
      const gray=keep(new cv.Mat());
      cv.cvtColor(src,gray,cv.COLOR_RGBA2GRAY);
      const blur=keep(new cv.Mat());
      cv.GaussianBlur(gray,blur,new cv.Size(3,3),0,0,cv.BORDER_DEFAULT);
      const binary=keep(new cv.Mat());
      cv.adaptiveThreshold(blur,binary,255,cv.ADAPTIVE_THRESH_GAUSSIAN_C,cv.THRESH_BINARY_INV,31,9);

      const contours=keep(new cv.MatVector());
      const hierarchy=keep(new cv.Mat());
      cv.findContours(binary,contours,hierarchy,cv.RETR_LIST,cv.CHAIN_APPROX_SIMPLE);

      let bestScore=-Infinity;
      for(let i=0;i<contours.size();i++){
        const cnt=contours.get(i);
        try{
          const r=cv.boundingRect(cnt);
          const area=Math.abs(cv.contourArea(cnt));
          const boxArea=Math.max(1,r.width*r.height);
          const fill=area/boxArea;
          const areaRatio=boxArea/(W*H);
          const cx=r.x+r.width/2,cy=r.y+r.height/2;
          const centerPenalty=Math.hypot((cx-W/2)/W,(cy-H/2)/H);
          const borderTouch=r.x<3||r.y<3||r.x+r.width>W-3||r.y+r.height>H-3;

          if(r.width>W*.18 && r.height>H*.10 && areaRatio>.025 && areaRatio<.42 && fill>.12){
            const targetArea=.10;
            const areaPenalty=Math.abs(Math.log(Math.max(.001,areaRatio)/targetArea));
            const aspect=r.width/Math.max(1,r.height);
            const aspectPenalty=(aspect<.35||aspect>4.5)?14:0;
            const score=28-areaPenalty*9+Math.min(fill,.55)*6-centerPenalty*8-(borderTouch?24:0)-aspectPenalty;
            if(score>bestScore){
              bestScore=score;
              bestRect={x:r.x,y:r.y,w:r.width,h:r.height,source:"contour",score};
            }
          }

          const perimeter=cv.arcLength(cnt,true);
          const circularity=perimeter>0 ? (4*Math.PI*area)/(perimeter*perimeter) : 0;
          const aspect=r.height? r.width/r.height : 0;
          const sizeRatio=Math.max(r.width,r.height)/Math.max(1,Math.min(W,H));
          if(r.width>=8 && r.height>=8 && aspect>.52 && aspect<1.48 && circularity>.16 && sizeRatio<.28){
            const fillScore=1-Math.min(1,Math.abs(fill-.38));
            const quality=circularity*.75+fillScore*.25;
            circleCandidates.push({cx:r.x+r.width/2,cy:r.y+r.height/2,r:(r.width+r.height)/4,quality,source:"contour"});
          }
        }finally{cnt.delete();}
      }

      const edges=keep(new cv.Mat());
      cv.Canny(blur,edges,25,90,3,false);
      const lines=keep(new cv.Mat());
      cv.HoughLinesP(edges,lines,1,Math.PI/180,25,Math.max(22,Math.min(W,H)*.07),18);
      const horizontal=[],vertical=[];
      for(let i=0;i<lines.rows;i++){
        const base=i*4;
        const x1=lines.data32S[base],y1=lines.data32S[base+1],x2=lines.data32S[base+2],y2=lines.data32S[base+3];
        const dx=x2-x1,dy=y2-y1,len=Math.hypot(dx,dy);
        if(len<25) continue;
        if(Math.abs(dy)<=len*.16) horizontal.push({x1:Math.min(x1,x2),x2:Math.max(x1,x2),y:(y1+y2)/2,len});
        if(Math.abs(dx)<=len*.16) vertical.push({y1:Math.min(y1,y2),y2:Math.max(y1,y2),x:(x1+x2)/2,len});
      }

      function mergeH(input){
        const groups=[];
        for(const l of [...input].sort((a,b)=>a.y-b.y)){
          let g=groups.find(g=>Math.abs(g.y-l.y)<=5 && !(l.x1>g.x2+10 || l.x2<g.x1-10));
          if(!g){
            groups.push({...l,weight:l.len});
          }else{
            const total=g.weight+l.len;
            g.y=(g.y*g.weight+l.y*l.len)/total;
            g.weight=total;
            g.x1=Math.min(g.x1,l.x1);g.x2=Math.max(g.x2,l.x2);
            g.len=g.x2-g.x1;
          }
        }
        return groups;
      }
      function mergeV(input){
        const groups=[];
        for(const l of [...input].sort((a,b)=>a.x-b.x)){
          let g=groups.find(g=>Math.abs(g.x-l.x)<=5 && !(l.y1>g.y2+10 || l.y2<g.y1-10));
          if(!g){
            groups.push({...l,weight:l.len});
          }else{
            const total=g.weight+l.len;
            g.x=(g.x*g.weight+l.x*l.len)/total;
            g.weight=total;
            g.y1=Math.min(g.y1,l.y1);g.y2=Math.max(g.y2,l.y2);
            g.len=g.y2-g.y1;
          }
        }
        return groups;
      }

      const hs=mergeH(horizontal).sort((a,b)=>b.len-a.len).slice(0,18);
      const vs=mergeV(vertical).sort((a,b)=>b.len-a.len).slice(0,18);
      let houghBest=null,houghScore=-Infinity;
      rectCandidates=[];
      for(let a=0;a<hs.length;a++) for(let b=a+1;b<hs.length;b++){
        const top=Math.min(hs[a].y,hs[b].y),bottom=Math.max(hs[a].y,hs[b].y);
        if(bottom-top<H*.10) continue;
        for(let c=0;c<vs.length;c++) for(let d=c+1;d<vs.length;d++){
          const left=Math.min(vs[c].x,vs[d].x),right=Math.max(vs[c].x,vs[d].x);
          if(right-left<W*.12) continue;
          const rw=right-left,rh=bottom-top;
          const areaRatio=(rw*rh)/(W*H);
          if(areaRatio<.025||areaRatio>.82) continue;
          const tolX=Math.max(12,rw*.10),tolY=Math.max(12,rh*.10);
          const coverH=[hs[a],hs[b]].filter(l=>l.x1<=left+tolX && l.x2>=right-tolX).length;
          const coverV=[vs[c],vs[d]].filter(l=>l.y1<=top+tolY && l.y2>=bottom-tolY).length;
          const cx=(left+right)/2,cy=(top+bottom)/2;
          const centerPenalty=Math.hypot((cx-W/2)/W,(cy-H/2)/H);
          const aspect=rw/Math.max(1,rh);
          const areaPenalty=Math.abs(Math.log(Math.max(.001,areaRatio)/.10));
          const aspectPenalty=(aspect<.35||aspect>4.5)?18:0;
          const minSide=Math.min(rw,rh);
          const innerCircleCount=circleCandidates.filter(cc=>
            cc.quality>=.58 &&
            cc.cx>left+rw*.08 && cc.cx<right-rw*.08 &&
            cc.cy>top+rh*.08 && cc.cy<bottom-rh*.08 &&
            cc.r>=Math.max(3,minSide*.025) && cc.r<=minSide*.18
          ).length;
          const circleBonus=Math.min(2,innerCircleCount)*10;
          const ratioPenalty=targetAspect?
            Math.abs(Math.log(Math.max(.05,aspect)/Math.max(.05,targetAspect)))*72:0;
          const score=(coverH+coverV)*15-areaPenalty*9-centerPenalty*8-aspectPenalty+circleBonus-ratioPenalty;
          const candidate={x:left,y:top,w:rw,h:rh,source:"lines",score,coverH,coverV,innerCircleCount};
          rectCandidates.push(candidate);
          if(score>houghScore){
            houghScore=score;houghBest=candidate;
          }
        }
      }
      if(houghBest && houghBest.score>=30){
        bestRect=houghBest;
      }

      if(!bestRect){
        if(horizontal.length||vertical.length){
          let minX=W,minY=H,maxX=0,maxY=0;
          horizontal.forEach(l=>{minX=Math.min(minX,l.x1);maxX=Math.max(maxX,l.x2);minY=Math.min(minY,l.y);maxY=Math.max(maxY,l.y);});
          vertical.forEach(l=>{minX=Math.min(minX,l.x);maxX=Math.max(maxX,l.x);minY=Math.min(minY,l.y1);maxY=Math.max(maxY,l.y2);});
          if(maxX-minX>W*.15 && maxY-minY>H*.10) bestRect={x:minX,y:minY,w:maxX-minX,h:maxY-minY,source:"bounds",score:0};
        }
      }

      if(bestRect){
        const minSide=Math.min(bestRect.w,bestRect.h);
        const x1=Math.max(0,Math.round(bestRect.x));
        const y1=Math.max(0,Math.round(bestRect.y));
        const x2=Math.min(W,Math.round(bestRect.x+bestRect.w));
        const y2=Math.min(H,Math.round(bestRect.y+bestRect.h));

        // Search only inside the detected part outline. This prevents zeros in
        // dimension text from being mistaken for holes.
        try{
          const roi=keep(gray.roi(new cv.Rect(x1,y1,Math.max(1,x2-x1),Math.max(1,y2-y1))));
          const roiBlur=keep(new cv.Mat());
          cv.medianBlur(roi,roiBlur,5);
          const circlesMat=keep(new cv.Mat());
          const minR=Math.max(4,Math.round(minSide*.025));
          const maxR=Math.max(minR+3,Math.round(minSide*.17));
          cv.HoughCircles(
            roiBlur,circlesMat,cv.HOUGH_GRADIENT,
            1.1,Math.max(18,minSide*.16),70,12,minR,maxR
          );
          for(let i=0;i<circlesMat.cols;i++){
            const k=i*3;
            const gcx=x1+circlesMat.data32F[k];
            const gcy=y1+circlesMat.data32F[k+1];
            const gr=circlesMat.data32F[k+2];
            let ring=0,inside=0,outside=0,n=0;
            for(let a=0;a<Math.PI*2;a+=Math.PI/18){
              const sample=(rr)=>{
                const sx=Math.max(0,Math.min(W-1,Math.round(gcx+Math.cos(a)*rr)));
                const sy=Math.max(0,Math.min(H-1,Math.round(gcy+Math.sin(a)*rr)));
                return gray.ucharPtr(sy,sx)[0];
              };
              ring+=sample(gr);
              inside+=sample(gr*.58);
              outside+=sample(gr*1.34);
              n++;
            }
            const contrast=n?((inside+outside-2*ring)/n):0;
            circleCandidates.push({
              cx:gcx,cy:gcy,r:gr,
              quality:.72+Math.max(-.2,Math.min(.55,contrast/55)),
              source:"roi-hough",
              ringContrast:contrast
            });
          }
        }catch(e){console.warn("hole hough",e)}

        const margin=Math.max(4,minSide*.035);
        circleCandidates=circleCandidates.filter(c=>
          c.cx>x1+margin && c.cx<x2-margin &&
          c.cy>y1+margin && c.cy<y2-margin &&
          c.r>=Math.max(3,minSide*.018) && c.r<minSide*.20 &&
          (c.source!=="roi-hough" || (c.ringContrast??0)>6)
        );
        circleCandidates.sort((a,b)=>b.quality-a.quality);
        const dedup=[];
        for(const cc of circleCandidates){
          if(dedup.some(d=>Math.hypot(d.cx-cc.cx,d.cy-cc.cy)<Math.max(9,(d.r+cc.r)*.60))) continue;
          dedup.push(cc);
          if(dedup.length>=4) break;
        }
        circleCandidates=dedup;
      }
    }finally{
      mats.reverse().forEach(m=>{try{m.delete();}catch{}});
    }
    return {rect:bestRect,circles:circleCandidates,candidates:rectCandidates.sort((a,b)=>b.score-a.score).slice(0,12)};
  }

  function detectGeometryFallback(){
    const canvas=$("handSourceCanvas");
    const W=canvas.width,H=canvas.height;
    const x=canvas.getContext("2d",{willReadFrequently:true});
    const data=x.getImageData(0,0,W,H).data;
    const row=new Uint32Array(H),col=new Uint32Array(W);
    for(let y=0;y<H;y++){
      for(let xx=0;xx<W;xx++){
        const i=(y*W+xx)*4;
        const gray=.299*data[i]+.587*data[i+1]+.114*data[i+2];
        if(gray<150){row[y]++;col[xx]++;}
      }
    }
    const rowThresh=Math.max(10,W*.06),colThresh=Math.max(10,H*.06);
    const ys=[],xs=[];
    for(let y=Math.round(H*.12);y<Math.round(H*.88);y++) if(row[y]>rowThresh) ys.push(y);
    for(let xx=Math.round(W*.12);xx<Math.round(W*.88);xx++) if(col[xx]>colThresh) xs.push(xx);
    if(xs.length<2||ys.length<2) return {rect:null,circles:[]};
    const left=xs[0],right=xs[xs.length-1],top=ys[0],bottom=ys[ys.length-1];
    if(right-left<W*.15||bottom-top<H*.10) return {rect:null,circles:[]};
    return {rect:{x:left,y:top,w:right-left,h:bottom-top,source:"fast"},circles:[]};
  }

  function normalizeWordText(text){
    return String(text||"")
      .replace(/[，,]/g,".")
      .replace(/[×＊*]/g,"x")
      .replace(/[ØøΦφ⌀]/g,"D")
      .replace(/^O(?=\d)/i,"D")
      .replace(/\s+/g,"")
      .trim();
  }

  function parseWord(word){
    const text=normalizeWordText(word.text);
    if(!text) return [];
    const box=word.bbox||word.boundingBox;
    if(!box || !Number.isFinite(box.x0)) return [];
    const pair=text.match(/(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)/i);
    if(pair){
      return [
        {kind:"pairWidth",value:Number(pair[1]),text:word.text,bbox:box,confidence:word.confidence||0},
        {kind:"pairHeight",value:Number(pair[2]),text:word.text,bbox:box,confidence:word.confidence||0}
      ];
    }
    const m=text.match(/[-+]?\d+(?:\.\d+)?/);
    if(!m) return [];
    const value=Math.abs(Number(m[0]));
    if(!Number.isFinite(value)||value<=0||value>100000) return [];
    let kind="plain";
    if(/^[DO](?=\d)/i.test(text)) kind="diameter";
    else if(/^R/i.test(text)) kind="radius";
    else if(/^M/i.test(text)) kind="thread";
    return [{kind,value,text:word.text,bbox:box,confidence:word.confidence||0}];
  }

  function mapRotatedBox(box,W,H){
    const pts=[
      {x:box.y0,y:H-box.x0},
      {x:box.y1,y:H-box.x0},
      {x:box.y0,y:H-box.x1},
      {x:box.y1,y:H-box.x1}
    ];
    return {
      x0:Math.min(...pts.map(p=>p.x)),
      y0:Math.min(...pts.map(p=>p.y)),
      x1:Math.max(...pts.map(p=>p.x)),
      y1:Math.max(...pts.map(p=>p.y))
    };
  }

  function rotatedCanvas90(source){
    const c=document.createElement("canvas");
    c.width=source.height;c.height=source.width;
    const x=c.getContext("2d");
    x.translate(c.width,0);
    x.rotate(Math.PI/2);
    x.drawImage(source,0,0);
    return c;
  }

  function cropCanvas(source,x,y,w,h,rotate=false,scaleUp=2.2){
    const sx=clamp(Math.floor(x),0,source.width-1);
    const sy=clamp(Math.floor(y),0,source.height-1);
    const sw=clamp(Math.ceil(w),1,source.width-sx);
    const sh=clamp(Math.ceil(h),1,source.height-sy);
    const raw=document.createElement("canvas");
    raw.width=sw;raw.height=sh;
    raw.getContext("2d").drawImage(source,sx,sy,sw,sh,0,0,sw,sh);

    const pre=makeContrastCanvas(raw,true);
    const out=document.createElement("canvas");
    const tw=Math.max(1,Math.round(pre.width*scaleUp));
    const th=Math.max(1,Math.round(pre.height*scaleUp));
    if(rotate){
      out.width=th;out.height=tw;
      const g=out.getContext("2d");
      g.imageSmoothingEnabled=false;
      g.translate(out.width,0);g.rotate(Math.PI/2);
      g.drawImage(pre,0,0,tw,th);
    }else{
      out.width=tw;out.height=th;
      const g=out.getContext("2d");
      g.imageSmoothingEnabled=false;
      g.drawImage(pre,0,0,tw,th);
    }
    return {canvas:out,sourceBox:{x:sx,y:sy,w:sw,h:sh},rotate};
  }

  function remapCropWord(word,crop){
    const b=word.bbox||word.boundingBox;
    if(!b) return word;
    const scaleX=crop.rotate ? crop.sourceBox.h/crop.canvas.width : crop.sourceBox.w/crop.canvas.width;
    const scaleY=crop.rotate ? crop.sourceBox.w/crop.canvas.height : crop.sourceBox.h/crop.canvas.height;
    let box;
    if(!crop.rotate){
      box={
        x0:crop.sourceBox.x+b.x0*scaleX,
        y0:crop.sourceBox.y+b.y0*scaleY,
        x1:crop.sourceBox.x+b.x1*scaleX,
        y1:crop.sourceBox.y+b.y1*scaleY
      };
    }else{
      // inverse of clockwise 90 degree rotation
      const pts=[
        {x:b.y0*scaleY,y:crop.sourceBox.h-b.x0*scaleX},
        {x:b.y1*scaleY,y:crop.sourceBox.h-b.x0*scaleX},
        {x:b.y0*scaleY,y:crop.sourceBox.h-b.x1*scaleX},
        {x:b.y1*scaleY,y:crop.sourceBox.h-b.x1*scaleX}
      ];
      box={
        x0:crop.sourceBox.x+Math.min(...pts.map(p=>p.x)),
        y0:crop.sourceBox.y+Math.min(...pts.map(p=>p.y)),
        x1:crop.sourceBox.x+Math.max(...pts.map(p=>p.x)),
        y1:crop.sourceBox.y+Math.max(...pts.map(p=>p.y))
      };
    }
    return {...word,bbox:box};
  }

  async function ocrOne(worker,input,label,psm="11"){
    setStatus(label);
    await worker.setParameters({
      tessedit_pageseg_mode:psm,
      preserve_interword_spaces:"1",
      tessedit_char_whitelist:"0123456789.-+xXRMrmDdOoØøΦφ⌀"
    });
    return timeout(worker.recognize(input,{}, {text:true,blocks:true}),12000,label+"に時間がかかりすぎています");
  }

  async function recognizeWords(rect){
    const source=$("handSourceCanvas");
    const worker=await timeout(getOcrWorker(),18000,"文字認識エンジンの準備に時間がかかっています");
    const W=source.width,H=source.height;
    const mx=rect.w*.35,my=rect.h*.45;

    // Whole image: labels such as Ø10, M6 and fallback numbers.
    const whole=makeContrastCanvas(source,true);
    const wholeResult=await ocrOne(worker,whole,"図面全体の文字を確認しています…","11");
    const words=(wholeResult.data.words||[]).map(w=>({...w,region:"whole"}));
    let raw="【全体】\n"+(wholeResult.data.text||"");

    // Bottom horizontal dimensions (outer width, inner horizontal dimensions).
    const bottom=cropCanvas(
      source,
      rect.x-mx,
      rect.y+rect.h-rect.h*.10,
      rect.w+mx*2,
      Math.min(H-(rect.y+rect.h-rect.h*.10),rect.h*1.05),
      false,2.5
    );
    try{
      const br=await ocrOne(worker,bottom.canvas,"横寸法を確認しています…","11");
      const bw=(br.data.words||[]).map(w=>({...remapCropWord(w,bottom),region:"bottom"}));
      words.push(...bw);
      raw+="\n【下側寸法】\n"+(br.data.text||"");
    }catch(e){console.warn(e)}

    // Dimension values themselves are normally written upright even for a
    // vertical dimension line, so do not rotate this crop.
    const right=cropCanvas(
      source,
      rect.x+rect.w-rect.w*.05,
      rect.y-my*.35,
      Math.min(W-(rect.x+rect.w-rect.w*.05),rect.w*.95),
      rect.h+my*.7,
      false,2.5
    );
    try{
      const rr=await ocrOne(worker,right.canvas,"縦寸法を確認しています…","11");
      const rw=(rr.data.words||[]).map(w=>({...remapCropWord(w,right),region:"right"}));
      words.push(...rw);
      raw+="\n【右側寸法】\n"+(rr.data.text||"");
    }catch(e){console.warn(e)}

    return {words,raw};
  }

  function makeContrastCanvas(source,strong=false){
    const out=document.createElement("canvas");
    out.width=source.width;out.height=source.height;
    const x=out.getContext("2d",{willReadFrequently:true});
    x.drawImage(source,0,0);
    const img=x.getImageData(0,0,out.width,out.height);
    const d=img.data;
    // Pencil lines are faint. Raise local contrast without erasing mid-gray strokes.
    const threshold=strong?205:190;
    for(let i=0;i<d.length;i+=4){
      const gray=.299*d[i]+.587*d[i+1]+.114*d[i+2];
      let v;
      if(strong){
        v=gray<threshold ? Math.max(0,(gray-105)*1.15) : 255;
        if(gray<165) v=0;
      }else{
        v=gray<185?0:255;
      }
      d[i]=d[i+1]=d[i+2]=v;
    }
    x.putImageData(img,0,0);
    return out;
  }


  async function waitForHandwritingAI(ms=5000){
    const started=Date.now();
    while(Date.now()-started<ms){
      if(window.HandwritingAI?.readCanvas) return window.HandwritingAI;
      await new Promise(r=>setTimeout(r,80));
    }
    return null;
  }

  function aiCrop(source,x,y,w,h,scale=2.0){
    const sx=clamp(Math.floor(x),0,source.width-1);
    const sy=clamp(Math.floor(y),0,source.height-1);
    const sw=clamp(Math.ceil(w),1,source.width-sx);
    const sh=clamp(Math.ceil(h),1,source.height-sy);
    const raw=document.createElement("canvas");
    raw.width=sw;raw.height=sh;
    const rctx=raw.getContext("2d");
    rctx.fillStyle="#fff";rctx.fillRect(0,0,sw,sh);
    rctx.drawImage(source,sx,sy,sw,sh,0,0,sw,sh);
    const enhanced=makeContrastCanvas(raw,true);
    const out=document.createElement("canvas");
    out.width=Math.max(64,Math.round(enhanced.width*scale));
    out.height=Math.max(48,Math.round(enhanced.height*scale));
    const g=out.getContext("2d");
    g.fillStyle="#fff";g.fillRect(0,0,out.width,out.height);
    g.imageSmoothingEnabled=true;
    g.drawImage(enhanced,0,0,out.width,out.height);
    return out;
  }

  function bestPlainToken(result,preferLargest=true){
    const list=(result?.tokens||[]).filter(t=>t.kind==="plain"&&t.value>=1&&t.value<=10000);
    if(!list.length) return null;
    return [...list].sort((a,b)=>preferLargest?b.value-a.value:a.value-b.value)[0];
  }

  async function aiReadOuterDimensions(rect,current){
    if(Number.isFinite(current.width)&&Number.isFinite(current.height)) return current;
    const ai=await waitForHandwritingAI();
    if(!ai) return current;
    const source=$("handSourceCanvas");
    const W=source.width,H=source.height;
    const out={...current};
    const report=p=>{
      const msg=p?.message||"手書きAIで寸法を確認しています…";
      setStatus(msg+(p?.progress===null?"":""));
    };

    state.aiUsed=true;
    // Outer width is normally the farthest horizontal dimension below the part.
    if(!Number.isFinite(out.width)){
      const y0=rect.y+rect.h+rect.h*.88;
      const crop=aiCrop(
        source,
        rect.x-rect.w*.20,
        y0,
        rect.w*1.40,
        Math.max(36,H-y0),
        2.2
      );
      try{
        const result=await ai.readCanvas(crop,report,{label:"外形の横寸法をAIで確認しています…",max_new_tokens:12});
        const token=bestPlainToken(result,true);
        if(token){
          out.width=token.value;
          out.aiWidthText=result.text;
        }
      }catch(e){console.warn("AI width",e)}
    }

    // Outer height is normally the farthest dimension to the right of the part.
    if(!Number.isFinite(out.height)){
      const x0=rect.x+rect.w+rect.w*.14;
      const crop=aiCrop(
        source,
        x0,
        rect.y-rect.h*.18,
        Math.max(36,W-x0),
        rect.h*1.36,
        2.4
      );
      try{
        const result=await ai.readCanvas(crop,report,{label:"外形の縦寸法をAIで確認しています…",max_new_tokens:12});
        const token=bestPlainToken(result,true);
        if(token){
          out.height=token.value;
          out.aiHeightText=result.text;
        }
      }catch(e){console.warn("AI height",e)}
    }

    // Reject a pair that is wildly inconsistent with the detected part shape.
    if(Number.isFinite(out.width)&&Number.isFinite(out.height)){
      const geometryRatio=rect.w/Math.max(1,rect.h);
      const numberRatio=out.width/Math.max(.001,out.height);
      const mismatch=Math.abs(Math.log(Math.max(.05,numberRatio)/Math.max(.05,geometryRatio)));
      if(mismatch>0.95){
        if(!Number.isFinite(current.width)) out.width=null;
        if(!Number.isFinite(current.height)) out.height=null;
      }
    }
    return out;
  }

  async function aiRefineHoleLabels(rect,holes){
    if(!holes.length) return holes;
    const needs=holes.filter(h=>!h.label);
    if(!needs.length) return holes;
    const ai=await waitForHandwritingAI();
    if(!ai) return holes;
    const source=$("handSourceCanvas");
    const report=p=>setStatus(p?.message||"穴表記をAIで確認しています…");
    state.aiUsed=true;

    for(const h of needs.slice(0,3)){
      const cc=state.circles[h.index-1];
      if(!cc) continue;
      const crop=aiCrop(
        source,
        cc.cx-rect.w*.62,
        cc.cy-rect.h*.48,
        rect.w*.92,
        rect.h*.76,
        2.1
      );
      try{
        const result=await ai.readCanvas(crop,report,{label:"穴のφ・M表記をAIで確認しています…",max_new_tokens:12});
        const technical=(result.tokens||[]).find(t=>t.kind==="diameter"||t.kind==="thread");
        const plain=(result.tokens||[]).find(t=>t.kind==="plain");
        const token=technical||plain;
        if(!token) continue;
        if(token.kind==="thread"){
          h.holeKind="M"+token.value;
          h.label="M"+token.value;
          h.threadSize=token.value;
          // Keep diameter empty: thread nominal size is not the drilled diameter.
        }else{
          h.diameter=token.value;
          h.holeKind="through";
          h.label="Ø"+token.value;
        }
      }catch(e){console.warn("AI hole",e)}
    }
    return holes;
  }

  function candidateScore(d,rect,axis){
    const p=centerOfBox(d.bbox);
    const right=rect.x+rect.w,bottom=rect.y+rect.h;
    const conf=(d.confidence||0)/100;
    if(axis==="width"){
      const cxDist=Math.abs(p.x-(rect.x+rect.w/2))/Math.max(1,rect.w/2);
      const below=(p.y>=rect.y+rect.h*.70);
      const bottomDist=Math.abs(p.y-bottom)/Math.max(1,rect.h);
      const regionBonus=d.region==="bottom"?2.5:0;
      return regionBonus+(below?2.2:0)+(1-Math.min(1,cxDist))*1.5+(1-Math.min(1,bottomDist))*1.0+conf*.6;
    }
    const cyDist=Math.abs(p.y-(rect.y+rect.h/2))/Math.max(1,rect.h/2);
    const onRight=(p.x>=rect.x+rect.w*.72);
    const rightDist=Math.abs(p.x-right)/Math.max(1,rect.w);
    const regionBonus=d.region==="right"?2.5:0;
    return regionBonus+(onRight?2.2:0)+(1-Math.min(1,cyDist))*1.5+(1-Math.min(1,rightDist))*1.0+conf*.6;
  }

  function chooseOuterDimensions(parsed,rect){
    const plain=parsed.filter(d=>d.kind==="plain" && d.value>=1 && d.value<=100000);
    const unique=[];
    for(const d of plain){
      const p=centerOfBox(d.bbox);
      if(unique.some(u=>u.value===d.value && Math.hypot(centerOfBox(u.bbox).x-p.x,centerOfBox(u.bbox).y-p.y)<18)) continue;
      unique.push(d);
    }
    if(!unique.length) return {width:null,height:null,widthDim:null,heightDim:null};

    const widthRank=unique.map(d=>({d,s:candidateScore(d,rect,"width")})).filter(x=>x.s>1.0).sort((a,b)=>b.s-a.s || b.d.value-a.d.value);
    const heightRank=unique.map(d=>({d,s:candidateScore(d,rect,"height")})).filter(x=>x.s>1.0).sort((a,b)=>b.s-a.s || b.d.value-a.d.value);

    // Prefer the largest plausible dimension among strongly positioned candidates.
    const wPool=widthRank.filter(x=>x.s>=Math.max(2.8,(widthRank[0]?.s||0)-1.3)).slice(0,6);
    const hPool=heightRank.filter(x=>x.s>=Math.max(2.8,(heightRank[0]?.s||0)-1.3)).slice(0,6);

    let best=null,bestScore=-Infinity;
    const pixelRatio=rect.w/Math.max(1,rect.h);
    for(const w of wPool){
      for(const h of hPool){
        if(w.d===h.d) continue;
        const ratio=w.d.value/Math.max(.001,h.d.value);
        const ratioPenalty=Math.abs(Math.log(Math.max(.05,ratio)/Math.max(.05,pixelRatio)));
        // Larger outside dimensions are more likely the overall size than 10/30/40 etc.
        const sizeBonus=Math.log10(Math.max(1,w.d.value*h.d.value))*.35;
        const score=w.s+h.s+sizeBonus-ratioPenalty*2.3;
        if(score>bestScore){bestScore=score;best={w:w.d,h:h.d,ratioPenalty};}
      }
    }

    // Do not confidently emit a clearly inconsistent pair. Wrong is worse than blank.
    if(!best || bestScore<5.0 || best.ratioPenalty>0.75){
      const w=wPool.sort((a,b)=>b.d.value-a.d.value)[0]?.d||null;
      const h=hPool.sort((a,b)=>b.d.value-a.d.value)[0]?.d||null;
      if(w&&h){
        const rp=Math.abs(Math.log((w.value/h.value)/pixelRatio));
        if(rp<=.75) return {width:w.value,height:h.value,widthDim:w,heightDim:h};
      }
      return {width:null,height:null,widthDim:null,heightDim:null};
    }
    return {width:best.w.value,height:best.h.value,widthDim:best.w,heightDim:best.h};
  }

  function mapHoles(parsed,rect,circles,width,height,usedDims){
    const candidates=parsed.filter(d=>!usedDims.has(d) && ["diameter","thread","plain"].includes(d.kind));
    return circles.map((c,index)=>{
      let best=null,bestScore=Infinity;
      for(const d of candidates){
        const p=centerOfBox(d.bbox);
        const dist=Math.hypot(p.x-c.cx,p.y-c.cy);
        const maxDist=Math.max(rect.w,rect.h)*.42;
        if(dist>maxDist) continue;
        let penalty=0;
        if(d.kind==="diameter") penalty=-maxDist*.20;
        else if(d.kind==="thread") penalty=-maxDist*.12;
        else penalty=maxDist*.16;
        const score=dist+penalty-(d.confidence||0)*.18;
        if(score<bestScore){bestScore=score;best=d;}
      }
      if(best) usedDims.add(best);
      const normX=clamp((c.cx-rect.x)/Math.max(1,rect.w),0,1);
      const normY=clamp((rect.y+rect.h-c.cy)/Math.max(1,rect.h),0,1);
      return {
        index:index+1,
        normX,
        normY,
        x:Number.isFinite(width)?roundValue(width*normX,2):null,
        y:Number.isFinite(height)?roundValue(height*normY,2):null,
        diameter:best?best.value:null,
        holeKind:best?.kind==="thread" ? "M"+best.value : "through",
        label:best?.kind==="thread" ? "M"+best.value : best?.kind==="diameter" ? "Ø"+best.value : "",
        dim:best,
        source:c.source
      };
    });
  }

  function roundValue(v,d=2){const p=10**d;return Math.round(v*p)/p;}

  function renderReview(){
    $("handReviewArea")?.classList.remove("hidden");
    $("handOuterWidth").value=state.width??"";
    $("handOuterHeight").value=state.height??"";
    const list=$("handHoleFields");
    if(list){
      if(!state.holes.length){
        list.innerHTML='<div class="hand-empty">穴は認識されませんでした。必要な穴はCAD画面で追加できます。</div>';
      }else{
        list.innerHTML=state.holes.map((h,i)=>
          '<div class="hand-hole-row" data-hole="'+i+'">'+
            '<strong>穴 '+(i+1)+(h.label?' '+h.label:'')+'</strong>'+
            '<label>X位置 mm<input class="hand-hole-x" inputmode="decimal" value="'+(h.x??"")+'" placeholder="未認識"></label>'+
            '<label>Y位置 mm<input class="hand-hole-y" inputmode="decimal" value="'+(h.y??"")+'" placeholder="未認識"></label>'+
            '<label>直径 Ø mm<input class="hand-hole-d" inputmode="decimal" value="'+(h.diameter??"")+'" placeholder="未認識"></label>'+
          '</div>'
        ).join("");
      }
    }
    $("handRecognizedText").textContent=state.rawText.trim()||"認識文字なし";
    const missed=[];
    if(!Number.isFinite(state.width)) missed.push("外形幅");
    if(!Number.isFinite(state.height)) missed.push("外形高さ");
    const missingHoleD=state.holes.filter(h=>!Number.isFinite(h.diameter)).length;
    if(missingHoleD) missed.push("穴径 "+missingHoleD+"個");
    setStatus(missed.length ? "自動認識で不足があります。写真をタップして補正してください。" : "図面化しました。寸法と穴位置を確認してください。", missed.length?"warn":"ok");
    markMissingInputs();
    drawCleanPreview();
    if(missed.length){
      setTimeout(()=>{
        openAssist();
        if(!Number.isFinite(state.width) || !Number.isFinite(state.height)) setAssistMode("outline");
      },120);
    }
  }

  function inputNumber(el){
    const raw=String(el?.value??"").trim();
    if(raw==="") return NaN;
    const v=Number(raw);
    return Number.isFinite(v)?v:NaN;
  }

  function markMissingInputs(){
    ["handOuterWidth","handOuterHeight"].forEach(id=>{
      const el=$(id);if(el) el.classList.toggle("needs-check",!(inputNumber(el)>0));
    });
    document.querySelectorAll(".hand-hole-row").forEach(row=>{
      row.querySelectorAll("input").forEach(inp=>{
        const v=inputNumber(inp);
        const bad=inp.classList.contains("hand-hole-d") ? !(v>0) : !(v>=0);
        inp.classList.toggle("needs-check",bad);
      });
    });
  }

  function syncHolePositionsFromOuter(){
    const w=Number($("handOuterWidth")?.value),h=Number($("handOuterHeight")?.value);
    document.querySelectorAll(".hand-hole-row").forEach((row,i)=>{
      const hole=state.holes[i];
      const x=row.querySelector(".hand-hole-x"),y=row.querySelector(".hand-hole-y");
      if(x && !x.value && Number.isFinite(w)&&w>0) x.value=roundValue(w*hole.normX,2);
      if(y && !y.value && Number.isFinite(h)&&h>0) y.value=roundValue(h*hole.normY,2);
    });
  }

  function reviewValues(){
    const width=inputNumber($("handOuterWidth"));
    const height=inputNumber($("handOuterHeight"));
    const holes=[];
    document.querySelectorAll(".hand-hole-row").forEach((row,i)=>{
      holes.push({
        x:inputNumber(row.querySelector(".hand-hole-x")),
        y:inputNumber(row.querySelector(".hand-hole-y")),
        d:inputNumber(row.querySelector(".hand-hole-d")),
        index:i+1
      });
    });
    return {width,height,holes};
  }

  function drawCleanPreview(){
    const canvas=$("handCadPreview");
    if(!canvas) return;
    const box=canvas.getBoundingClientRect();
    const dpr=window.devicePixelRatio||1;
    const cssW=Math.max(280,Math.round(box.width||320));
    const cssH=Math.max(260,Math.min(520,Math.round(cssW*.82)));
    canvas.width=Math.round(cssW*dpr);canvas.height=Math.round(cssH*dpr);
    canvas.style.height=cssH+"px";
    const c=canvas.getContext("2d");
    c.setTransform(dpr,0,0,dpr,0,0);
    c.clearRect(0,0,cssW,cssH);
    c.fillStyle="#fff";c.fillRect(0,0,cssW,cssH);
    c.strokeStyle="#1e2935";c.fillStyle="#1e2935";c.lineWidth=2;
    const vals=reviewValues();
    let w=vals.width>0?vals.width:(state.rect?.w||100);
    let h=vals.height>0?vals.height:(state.rect?.h||70);
    const pad=58;
    const sc=Math.min((cssW-pad*2)/Math.max(w,1),(cssH-pad*2)/Math.max(h,1));
    const ox=(cssW-w*sc)/2,oy=(cssH+h*sc)/2;
    const P=(x,y)=>({x:ox+x*sc,y:oy-y*sc});

    const a=P(0,0),b=P(w,h);
    c.strokeRect(a.x,b.y,w*sc,h*sc);

    c.font="600 13px system-ui";
    c.textAlign="center";c.textBaseline="middle";
    const topY=b.y-22;
    c.beginPath();c.moveTo(a.x,b.y-10);c.lineTo(a.x,topY);c.moveTo(a.x+w*sc,b.y-10);c.lineTo(a.x+w*sc,topY);c.moveTo(a.x,topY);c.lineTo(a.x+w*sc,topY);c.stroke();
    c.fillStyle="#fff";c.fillRect(cssW/2-32,topY-10,64,20);c.fillStyle="#1e2935";
    c.fillText(vals.width>0?roundValue(vals.width,2)+" mm":"幅 未認識",cssW/2,topY);

    const leftX=a.x-28;
    c.beginPath();c.moveTo(a.x-10,a.y);c.lineTo(leftX,a.y);c.moveTo(a.x-10,b.y);c.lineTo(leftX,b.y);c.moveTo(leftX,a.y);c.lineTo(leftX,b.y);c.stroke();
    c.save();c.translate(leftX,(a.y+b.y)/2);c.rotate(-Math.PI/2);
    c.fillStyle="#fff";c.fillRect(-35,-10,70,20);c.fillStyle="#1e2935";
    c.fillText(vals.height>0?roundValue(vals.height,2)+" mm":"高さ 未認識",0,0);c.restore();

    vals.holes.forEach((hole,i)=>{
      let x=hole.x,y=hole.y,d=hole.d;
      if(!(Number.isFinite(x)&&x>=0)) x=w*(state.holes[i]?.normX??.5);
      if(!(Number.isFinite(y)&&y>=0)) y=h*(state.holes[i]?.normY??.5);
      let r=(Number.isFinite(d)&&d>0)?d/2:Math.min(w,h)*.035;
      const p=P(x,y);
      c.beginPath();c.arc(p.x,p.y,Math.max(4,r*sc),0,Math.PI*2);c.stroke();
      c.beginPath();c.moveTo(p.x-7,p.y);c.lineTo(p.x+7,p.y);c.moveTo(p.x,p.y-7);c.lineTo(p.x,p.y+7);c.stroke();
      c.fillStyle="#fff";c.fillRect(p.x-28,p.y-Math.max(4,r*sc)-22,56,18);c.fillStyle="#1e2935";
      c.fillText(d>0?"Ø"+roundValue(d,2):"Ø ?",p.x,p.y-Math.max(4,r*sc)-13);
    });
  }

  async function recognize(){
    if(!state.imageReady||state.working) return;
    setBusy(true);
    $("handReviewArea")?.classList.add("hidden");
    try{
      setStatus("外形と穴を認識しています…");
      let geo={rect:null,circles:[]};
      let cvLib=null;
      try{
        cvLib=await timeout(getOpenCV(),12000,"図形認識の準備が遅いため簡易認識に切り替えます");
        geo=detectGeometry(cvLib);
      }catch(e){console.warn(e)}
      if(!geo.rect) geo=detectGeometryFallback();
      if(!geo.rect) throw new Error("外形を認識できませんでした。外形線がはっきり見えるように撮影してください。");
      state.rect=geo.rect;
      state.circles=geo.circles;

      const ocr=await recognizeWords(state.rect);
      state.rawText=ocr.raw;
      const parsed=ocr.words.flatMap(parseWord);
      state.dims=parsed;
      let outer=chooseOuterDimensions(parsed,state.rect);
      if(!Number.isFinite(outer.width)||!Number.isFinite(outer.height)){
        setStatus("通常OCRで不足した寸法を手書きAIで確認します…","warn");
        outer=await aiReadOuterDimensions(state.rect,outer);
      }
      state.width=Number.isFinite(outer.width)?outer.width:null;
      state.height=Number.isFinite(outer.height)?outer.height:null;

      // Second geometry pass: use the recognized 60:50-style ratio to separate
      // the real part outline from dimension extension lines.
      if(cvLib && Number.isFinite(state.width)&&Number.isFinite(state.height)&&state.height>0){
        const targetAspect=state.width/state.height;
        try{
          const refined=detectGeometry(cvLib,targetAspect);
          if(refined?.rect){
            const oldRect=state.rect;
            const shift=Math.abs(refined.rect.x-oldRect.x)+Math.abs(refined.rect.y-oldRect.y)+
              Math.abs(refined.rect.w-oldRect.w)+Math.abs(refined.rect.h-oldRect.h);
            if(shift>4){
              state.rect=refined.rect;
              state.circles=refined.circles||[];
              state.rawText+="\n【外形再判定】 寸法比 "+roundValue(targetAspect,3)+" を使用";
            }
          }
        }catch(e){console.warn("geometry refine",e)}
      }

      const used=new Set();
      if(outer.widthDim) used.add(outer.widthDim);
      if(outer.heightDim) used.add(outer.heightDim);
      state.holes=mapHoles(parsed,state.rect,state.circles,state.width,state.height,used);
      state.holes=await aiRefineHoleLabels(state.rect,state.holes);
      if(state.aiUsed){
        state.rawText+="\n【手書きAI補助】\n"+
          (outer.aiWidthText?"横: "+outer.aiWidthText+"\n":"")+
          (outer.aiHeightText?"縦: "+outer.aiHeightText+"\n":"");
      }
      renderReview();
    }catch(err){
      console.error(err);
      setStatus(err?.message||"認識処理に失敗しました。撮影し直してください。","error");
    }finally{
      setBusy(false);
    }
  }



  function reliableMessage(message,kind=""){
    const el=$("reliableHint");
    if(!el) return;
    el.textContent=message;
    el.dataset.kind=kind;
  }

  function reliableInputNumber(id){
    const raw=String($(id)?.value??"").trim();
    if(raw==="") return NaN;
    const v=Number(raw);
    return Number.isFinite(v)?v:NaN;
  }

  function reliablePoint(e){
    const canvas=$("reliableCanvas");
    const r=canvas.getBoundingClientRect();
    return {
      x:clamp((e.clientX-r.left)/Math.max(1,r.width)*canvas.width,0,canvas.width),
      y:clamp((e.clientY-r.top)/Math.max(1,r.height)*canvas.height,0,canvas.height)
    };
  }

  function drawReliableCanvas(){
    const source=$("handSourceCanvas"),canvas=$("reliableCanvas");
    if(!source||!canvas||!state.imageReady) return;
    canvas.width=source.width;
    canvas.height=source.height;
    const g=canvas.getContext("2d");
    g.clearRect(0,0,canvas.width,canvas.height);
    g.drawImage(source,0,0);
    const lw=Math.max(2,canvas.width/320);

    if(state.rect){
      g.save();
      g.strokeStyle="#147d38";
      g.lineWidth=lw*2;
      g.setLineDash([lw*5,lw*3]);
      g.strokeRect(state.rect.x,state.rect.y,state.rect.w,state.rect.h);
      g.setLineDash([]);
      g.fillStyle="#147d38";
      g.font=Math.max(13,canvas.width/46)+"px system-ui";
      g.fillText("外形",state.rect.x+lw*3,Math.max(18,state.rect.y-lw*3));
      g.restore();
    }

    if(state.reliableCorners.length){
      g.save();
      g.fillStyle="#0057b8";
      for(const p of state.reliableCorners){
        g.beginPath();g.arc(p.x,p.y,lw*5,0,Math.PI*2);g.fill();
      }
      g.restore();
    }

    if(state.reliableHoles.length){
      g.save();
      g.strokeStyle="#b22222";
      g.fillStyle="#b22222";
      g.lineWidth=lw*2;
      g.font=Math.max(13,canvas.width/42)+"px system-ui";
      for(const h of state.reliableHoles){
        const p=h.photo;
        g.beginPath();g.arc(p.x,p.y,lw*5,0,Math.PI*2);g.stroke();
        g.beginPath();
        g.moveTo(p.x-lw*7,p.y);g.lineTo(p.x+lw*7,p.y);
        g.moveTo(p.x,p.y-lw*7);g.lineTo(p.x,p.y+lw*7);
        g.stroke();
        g.fillText(h.label,p.x+lw*8,p.y-lw*6);
      }
      g.restore();
    }
  }

  function renderReliableHoleList(){
    const list=$("reliableHoleList");
    if(!list) return;
    if(!state.reliableHoles.length){
      list.innerHTML='<div class="hand-empty">穴はまだ追加されていません。</div>';
      return;
    }
    list.innerHTML=state.reliableHoles.map((h,i)=>
      '<div class="reliable-hole-item"><span>穴 '+(i+1)+' '+h.label+'</span>'+
      '<span>X '+roundValue(h.x,2)+' / Y '+roundValue(h.y,2)+'</span></div>'
    ).join("");
  }

  function openReliable(){
    if(!state.imageReady) return;
    $("handReliableArea")?.classList.remove("hidden");
    $("handReviewArea")?.classList.add("hidden");
    state.reliableMode="size";
    state.reliableCorners=[];
    state.reliableHoles=[];
    state.reliableH=null;
    state.rect=null;
    $("reliableHoleControls")?.classList.add("hidden");
    $("reliableOutlineFixBtn")?.classList.add("hidden");
    reliableMessage("幅と高さを入力して「このサイズで進む」を押してください。");
    setTimeout(drawReliableCanvas,0);
  }

  async function detectReliableOutline(){
    const width=reliableInputNumber("reliableWidth");
    const height=reliableInputNumber("reliableHeight");
    if(!(width>0)||!(height>0)){
      reliableMessage("幅と高さを入力してください。","error");
      return;
    }

    setBusy(true);
    reliableMessage("外形位置を探しています…");
    let geo=null;
    try{
      const cv=await timeout(getOpenCV(),7000,"外形検出を簡易処理に切り替えます");
      geo=detectGeometry(cv,width/height);
    }catch(e){
      console.warn(e);
    }
    if(!geo?.rect) geo=detectGeometryFallback();

    if(geo?.rect){
      state.rect=geo.rect;
      state.reliableMode="holes";
      state.reliableHoles=[];
      $("reliableHoleControls")?.classList.remove("hidden");
      $("reliableOutlineFixBtn")?.classList.remove("hidden");
      renderReliableHoleList();
      reliableMessage("緑の外形が合っていれば、穴種類・サイズを選んで穴中心をタップしてください。","ok");
    }else{
      state.reliableMode="fixOutline";
      state.reliableCorners=[];
      $("reliableOutlineFixBtn")?.classList.remove("hidden");
      reliableMessage("外形を自動で取れませんでした。左上→右下の2点だけタップしてください。","warn");
    }
    drawReliableCanvas();
    setBusy(false);
  }

  function startOutlineFix(){
    state.reliableMode="fixOutline";
    state.reliableCorners=[];
    reliableMessage("外形の左上をタップ → 次に右下をタップしてください。");
    drawReliableCanvas();
  }

  function applyTwoPointOutline(){
    if(state.reliableCorners.length<2) return;
    const a=state.reliableCorners[0],b=state.reliableCorners[1];
    const x=Math.min(a.x,b.x),y=Math.min(a.y,b.y);
    const w=Math.abs(b.x-a.x),h=Math.abs(b.y-a.y);
    if(w<20||h<20){
      state.reliableCorners=[];
      reliableMessage("外形が小さすぎます。左上→右下でもう一度タップしてください。","error");
      drawReliableCanvas();
      return;
    }
    state.rect={x,y,w,h,source:"manual2"};
    state.reliableCorners=[];
    state.reliableMode="holes";
    $("reliableHoleControls")?.classList.remove("hidden");
    renderReliableHoleList();
    reliableMessage("外形を修正しました。穴種類・サイズを選んで穴中心をタップしてください。","ok");
    drawReliableCanvas();
  }

  function addReliableHole(p){
    if(!state.rect){
      reliableMessage("先に外形位置を決めてください。","error");
      return;
    }
    const width=reliableInputNumber("reliableWidth");
    const height=reliableInputNumber("reliableHeight");
    if(!(width>0)||!(height>0)) return;

    if(
      p.x<state.rect.x || p.x>state.rect.x+state.rect.w ||
      p.y<state.rect.y || p.y>state.rect.y+state.rect.h
    ){
      reliableMessage("緑の外形の内側にある穴中心をタップしてください。","error");
      return;
    }

    const size=reliableInputNumber("reliableHoleSize");
    if(!(size>0)){
      reliableMessage("穴サイズを入力してから穴中心をタップしてください。","error");
      return;
    }

    const normX=clamp((p.x-state.rect.x)/Math.max(1,state.rect.w),0,1);
    const normY=clamp((state.rect.y+state.rect.h-p.y)/Math.max(1,state.rect.h),0,1);
    const x=width*normX;
    const y=height*normY;

    const kind=$("reliableHoleKind")?.value||"through";
    const tap={3:2.5,4:3.3,5:4.2,6:5.0,8:6.8,10:8.5,12:10.2};
    const isThread=kind==="thread";
    const label=isThread?"M"+size:"Ø"+size;
    const diameter=isThread?(tap[size]||size):size;

    state.reliableHoles.push({
      photo:{x:p.x,y:p.y},
      x,y,normX,normY,
      diameter,
      holeKind:isThread?"M"+size:"through",
      threadSize:isThread?size:null,
      label,
      source:"simple"
    });
    renderReliableHoleList();
    reliableMessage(label+" を追加しました。続けて次の穴をタップできます。","ok");
    drawReliableCanvas();
  }

  function handleReliableTap(e){
    if(!state.imageReady) return;
    const p=reliablePoint(e);
    if(state.reliableMode==="fixOutline"){
      state.reliableCorners.push(p);
      if(state.reliableCorners.length===1){
        reliableMessage("左上を取得しました。次に右下をタップしてください。");
        drawReliableCanvas();
      }else{
        applyTwoPointOutline();
      }
      return;
    }
    if(state.reliableMode==="holes") addReliableHole(p);
  }

  function undoReliable(){
    if(state.reliableMode==="fixOutline"&&state.reliableCorners.length){
      state.reliableCorners.pop();
      reliableMessage("1点戻しました。");
      drawReliableCanvas();
      return;
    }
    if(state.reliableHoles.length){
      state.reliableHoles.pop();
      renderReliableHoleList();
      reliableMessage("最後の穴を削除しました。");
      drawReliableCanvas();
    }
  }

  function finishReliable(){
    const width=reliableInputNumber("reliableWidth");
    const height=reliableInputNumber("reliableHeight");
    if(!(width>0)||!(height>0)||!state.rect){
      reliableMessage("幅・高さと外形位置を確認してください。","error");
      return;
    }

    state.width=width;
    state.height=height;
    $("handOuterWidth").value=width;
    $("handOuterHeight").value=height;

    state.holes=state.reliableHoles.map((h,i)=>({
      index:i+1,
      normX:h.normX,normY:h.normY,
      x:h.x,y:h.y,
      diameter:h.diameter,
      holeKind:h.holeKind,
      threadSize:h.threadSize,
      label:h.label,
      source:"simple"
    }));

    state.rawText="【シンプル図面化】\n外形 "+width+" × "+height+" mm\n"+
      state.holes.map(h=>h.label+"  X="+roundValue(h.x,2)+" Y="+roundValue(h.y,2)).join("\n");

    $("handPhotoArea")?.classList.add("hidden");
    $("handReviewArea")?.classList.remove("hidden");
    renderReview();
    setStatus("図面化しました。内容を確認してください。","ok");
    $("handReviewArea")?.scrollIntoView({behavior:"smooth",block:"start"});
  }

  function backToReliable(){
    $("handReviewArea")?.classList.add("hidden");
    $("handPhotoArea")?.classList.remove("hidden");
    $("handReliableArea")?.classList.remove("hidden");
    state.reliableMode="holes";
    setTimeout(drawReliableCanvas,0);
    setStatus("修正したい項目を変更してください。");
  }

  function assistMessage(message){
    const el=$("handAssistHint");
    if(el) el.textContent=message;
  }

  function setAssistMode(mode){
    state.assistMode=mode;
    state.assistPoints=[];
    state.assistHoleCenter=null;
    document.querySelectorAll("[data-hand-assist]").forEach(btn=>{
      btn.classList.toggle("active",btn.dataset.handAssist===mode);
    });
    const messages={
      outline:"外形の左上をタップ → 次に右下をタップしてください。",
      width:"写真内の外形幅の数字（例: 60）をタップしてください。",
      height:"写真内の外形高さの数字（例: 50）をタップしてください。",
      hole:"穴の中心をタップ → 次に φ10 / M6 などの表記をタップしてください。"
    };
    assistMessage(messages[mode]||"補正する項目を選んでください。");
    drawAssistCanvas();
  }

  function openAssist(){
    if(!state.imageReady) return;
    $("handReviewArea")?.classList.remove("hidden");
    $("handAssistArea")?.classList.remove("hidden");
    const needOutline=!state.rect;
    const needWidth=!(Number($("handOuterWidth")?.value)>0);
    const needHeight=!(Number($("handOuterHeight")?.value)>0);
    setAssistMode(needOutline?"outline":needWidth?"width":needHeight?"height":"hole");
    setTimeout(drawAssistCanvas,0);
    $("handAssistArea")?.scrollIntoView({behavior:"smooth",block:"start"});
  }

  function closeAssist(){
    $("handAssistArea")?.classList.add("hidden");
    state.assistMode=null;
    state.assistPoints=[];
    state.assistHoleCenter=null;
    document.querySelectorAll("[data-hand-assist]").forEach(btn=>btn.classList.remove("active"));
  }

  function assistSourcePoint(e){
    const canvas=$("handAssistCanvas");
    const r=canvas.getBoundingClientRect();
    return {
      x:clamp((e.clientX-r.left)/Math.max(1,r.width)*canvas.width,0,canvas.width),
      y:clamp((e.clientY-r.top)/Math.max(1,r.height)*canvas.height,0,canvas.height)
    };
  }

  function drawAssistCanvas(){
    const source=$("handSourceCanvas"),canvas=$("handAssistCanvas");
    if(!source||!canvas||!state.imageReady) return;
    canvas.width=source.width;
    canvas.height=source.height;
    const g=canvas.getContext("2d");
    g.clearRect(0,0,canvas.width,canvas.height);
    g.drawImage(source,0,0);

    const lw=Math.max(2,canvas.width/300);
    if(state.rect){
      g.save();
      g.strokeStyle="#147d38";
      g.lineWidth=lw*2;
      g.setLineDash([lw*4,lw*3]);
      g.strokeRect(state.rect.x,state.rect.y,state.rect.w,state.rect.h);
      g.restore();
    }

    for(const h of state.holes){
      if(!state.rect) continue;
      const px=state.rect.x+(h.normX??.5)*state.rect.w;
      const py=state.rect.y+state.rect.h-(h.normY??.5)*state.rect.h;
      g.save();
      g.strokeStyle="#b22222";
      g.lineWidth=lw*1.6;
      g.beginPath();g.arc(px,py,lw*4,0,Math.PI*2);g.stroke();
      g.beginPath();g.moveTo(px-lw*6,py);g.lineTo(px+lw*6,py);
      g.moveTo(px,py-lw*6);g.lineTo(px,py+lw*6);g.stroke();
      if(h.label){
        g.font=Math.max(12,canvas.width/45)+"px system-ui";
        g.fillStyle="#b22222";
        g.fillText(h.label,px+lw*7,py-lw*5);
      }
      g.restore();
    }

    if(state.assistPoints.length){
      g.save();
      g.fillStyle="#0057b8";
      for(const p of state.assistPoints){
        g.beginPath();g.arc(p.x,p.y,lw*4,0,Math.PI*2);g.fill();
      }
      g.restore();
    }
    if(state.assistHoleCenter){
      const p=state.assistHoleCenter;
      g.save();
      g.strokeStyle="#0057b8";g.lineWidth=lw*2;
      g.beginPath();g.arc(p.x,p.y,lw*7,0,Math.PI*2);g.stroke();
      g.beginPath();g.moveTo(p.x-lw*9,p.y);g.lineTo(p.x+lw*9,p.y);
      g.moveTo(p.x,p.y-lw*9);g.lineTo(p.x,p.y+lw*9);g.stroke();
      g.restore();
    }
  }

  function parseAssistTokens(text){
    const normalized=String(text||"")
      .replace(/[ØøΦφ⌀]/g,"D")
      .replace(/[Oo](?=\d)/g,"0")
      .replace(/(?<=\d)[Oo]/g,"0")
      .replace(/[Il|]/g,"1")
      .replace(/\s+/g,"")
      .toUpperCase();
    const out=[];
    const re=/(M\d+(?:\.\d+)?|D\d+(?:\.\d+)?|R\d+(?:\.\d+)?|\d+(?:\.\d+)?)/g;
    for(const m of normalized.matchAll(re)){
      const raw=m[0];
      let kind="plain",value;
      if(raw[0]==="M"){kind="thread";value=Number(raw.slice(1))}
      else if(raw[0]==="D"){kind="diameter";value=Number(raw.slice(1))}
      else if(raw[0]==="R"){kind="radius";value=Number(raw.slice(1))}
      else value=Number(raw);
      if(Number.isFinite(value)&&value>0&&value<100000) out.push({kind,value,raw});
    }
    return out;
  }

  function focusedCropAt(p,kind){
    const source=$("handSourceCanvas");
    const wide=kind==="width"||kind==="height";
    const cw=Math.max(120,source.width*(wide?.24:.22));
    const ch=Math.max(70,source.height*(wide?.12:.14));
    return cropCanvas(source,p.x-cw/2,p.y-ch/2,cw,ch,false,3.0).canvas;
  }

  async function readFocusedValue(p,kind){
    const crop=focusedCropAt(p,kind);
    let tokens=[],raw="";
    try{
      const worker=await timeout(getOcrWorker(),12000,"文字認識を準備しています");
      const result=await ocrOne(worker,crop,"タップした文字だけを読み取っています…","7");
      raw=result.data?.text||"";
      tokens=parseAssistTokens(raw);
    }catch(e){console.warn("focused OCR",e)}

    if(!tokens.length){
      const ai=await waitForHandwritingAI(1800);
      if(ai){
        try{
          const result=await ai.readCanvas(crop,p=>setStatus(p?.message||"手書きAIで確認しています…"),{
            label:"タップした文字を手書きAIで確認しています…",
            max_new_tokens:10,
            num_beams:2
          });
          raw=result?.text||raw;
          tokens=(result?.tokens||[]).map(t=>({kind:t.kind,value:t.value,raw:t.raw}));
        }catch(e){console.warn("focused AI",e)}
      }
    }

    let token=null;
    if(kind==="hole"){
      token=tokens.find(t=>t.kind==="diameter"||t.kind==="thread")||tokens[0]||null;
    }else{
      const plain=tokens.filter(t=>t.kind==="plain");
      token=plain.sort((a,b)=>b.value-a.value)[0]||tokens.find(t=>Number.isFinite(t.value))||null;
    }
    return {token,raw};
  }

  function manualAssistValue(kind,guessText=""){
    const label=kind==="width"?"外形幅":kind==="height"?"外形高さ":"穴表記";
    const input=window.prompt(
      label+"を読み取れませんでした。値を入力してください。"+
      (kind==="hole"?"（例: φ10 / M6）":"（mm）"),
      guessText||""
    );
    if(input===null) return null;
    const tokens=parseAssistTokens(input);
    if(kind==="hole") return tokens.find(t=>t.kind==="diameter"||t.kind==="thread")||tokens[0]||null;
    return tokens.find(t=>t.kind==="plain")||tokens[0]||null;
  }

  async function handleAssistTap(e){
    if(state.assistBusy||!state.assistMode) return;
    const p=assistSourcePoint(e);
    const mode=state.assistMode;

    if(mode==="outline"){
      state.assistPoints.push(p);
      if(state.assistPoints.length===1){
        assistMessage("左上を取得しました。次に外形の右下をタップしてください。");
        drawAssistCanvas();
        return;
      }
      const a=state.assistPoints[0],b=state.assistPoints[1];
      const x=Math.min(a.x,b.x),y=Math.min(a.y,b.y);
      const w=Math.abs(b.x-a.x),h=Math.abs(b.y-a.y);
      if(w<20||h<20){
        state.assistPoints=[];
        assistMessage("外形が小さすぎます。左上→右下でもう一度指定してください。");
        drawAssistCanvas();return;
      }
      state.rect={x,y,w,h,source:"manual"};
      state.assistPoints=[];
      // Re-map existing hole positions to the newly confirmed outline.
      assistMessage("外形を指定しました。次に写真の「全幅の数字」をタップしてください。");
      drawAssistCanvas();
      setTimeout(()=>setAssistMode("width"),250);
      return;
    }

    if(mode==="width"||mode==="height"){
      state.assistBusy=true;
      state.assistPoints=[p];drawAssistCanvas();
      try{
        let {token,raw}=await readFocusedValue(p,mode);
        if(!token) token=manualAssistValue(mode,raw);
        if(token&&Number.isFinite(token.value)){
          const id=mode==="width"?"handOuterWidth":"handOuterHeight";
          $(id).value=token.value;
          if(mode==="width") state.width=token.value; else state.height=token.value;
          syncHolePositionsFromOuter();
          markMissingInputs();drawCleanPreview();
          assistMessage((mode==="width"?"外形幅 ":"外形高さ ")+token.value+" mm を設定しました。");
          if(mode==="width") setTimeout(()=>setAssistMode("height"),250);
          else setTimeout(()=>setAssistMode("hole"),250);
        }else{
          assistMessage("寸法を設定しませんでした。もう一度数字の中央をタップしてください。");
        }
      }finally{
        state.assistBusy=false;state.assistPoints=[];drawAssistCanvas();
      }
      return;
    }

    if(mode==="hole"){
      if(!state.assistHoleCenter){
        state.assistHoleCenter=p;
        assistMessage("穴中心を取得しました。次に、この穴の φ10 / M6 などの文字をタップしてください。");
        drawAssistCanvas();return;
      }
      state.assistBusy=true;
      state.assistPoints=[p];drawAssistCanvas();
      try{
        let {token,raw}=await readFocusedValue(p,"hole");
        if(!token) token=manualAssistValue("hole",raw);
        if(!token){
          assistMessage("穴表記を設定しませんでした。表記の中央をもう一度タップしてください。");
          return;
        }
        const center=state.assistHoleCenter;
        const rect=state.rect||{x:0,y:0,w:$("handSourceCanvas").width,h:$("handSourceCanvas").height};
        const normX=clamp((center.x-rect.x)/Math.max(1,rect.w),0,1);
        const normY=clamp((rect.y+rect.h-center.y)/Math.max(1,rect.h),0,1);
        const width=inputNumber($("handOuterWidth")),height=inputNumber($("handOuterHeight"));
        const isThread=token.kind==="thread";
        const label=isThread?"M"+token.value:"Ø"+token.value;
        const tapDrillMap={3:2.5,4:3.3,5:4.2,6:5.0,8:6.8,10:8.5,12:10.2};
        const holeDiameter=isThread?(tapDrillMap[token.value]||token.value):token.value;
        state.holes.push({
          index:state.holes.length+1,
          normX,normY,
          x:Number.isFinite(width)?roundValue(width*normX,2):null,
          y:Number.isFinite(height)?roundValue(height*normY,2):null,
          diameter:holeDiameter,
          holeKind:isThread?"M"+token.value:"through",
          threadSize:isThread?token.value:null,
          label,
          source:"manual"
        });
        state.circles.push({cx:center.x,cy:center.y,r:8,quality:1,source:"manual"});
        renderReview();
        $("handAssistArea")?.classList.remove("hidden");
        setAssistMode("hole");
        assistMessage(label+" の穴を追加しました。続ける場合は次の穴中心をタップしてください。");
      }finally{
        state.assistBusy=false;state.assistHoleCenter=null;state.assistPoints=[];drawAssistCanvas();
      }
    }
  }

  function buildCadShapes(){
    syncHolePositionsFromOuter();
    const vals=reviewValues();
    if(!(vals.width>0) || !(vals.height>0)){
      setStatus("外形の幅・高さを確認して入力してください。","error");
      markMissingInputs();
      return null;
    }
    const result=[];
    result.push({id:newId(),type:"rect",x:0,y:0,w:vals.width,h:vals.height,corners:{},layer:"0"});
    vals.holes.forEach(h=>{
      if(Number.isFinite(h.x)&&Number.isFinite(h.y)&&h.x>=0&&h.y>=0&&h.d>0){
        const meta=state.holes[h.index-1]||{};
        result.push({id:newId(),type:"hole",cx:h.x,cy:h.y,r:h.d/2,holeKind:meta.holeKind||"through",layer:"1"});
      }
    });
    const dimOffset=Math.max(8,Math.min(vals.width,vals.height)*.12);
    result.push({
      id:newId(),type:"dim",x1:0,y1:0,x2:vals.width,y2:0,
      tx:vals.width/2,ty:-dimOffset,mode:"horizontal",layer:"2"
    });
    result.push({
      id:newId(),type:"dim",x1:0,y1:0,x2:0,y2:vals.height,
      tx:-dimOffset,ty:vals.height/2,mode:"vertical",layer:"2"
    });
    return result;
  }

  function applyToCad(keepPanel=false){
    const result=buildCadShapes();
    if(!result) return false;
    shapes=result;
    selectedId=null;
    if(typeof selectedIds!=="undefined") selectedIds.clear();
    snapshot();
    if(typeof setTool==="function") setTool("select");
    if(typeof fitView==="function") fitView();
    else if(typeof draw==="function") draw();
    if(!keepPanel) closePanel();
    if(typeof hint!=="undefined"&&hint) hint.textContent="手書き図面をCAD化しました。内容を編集できます";
    return true;
  }

  function exportAfterReview(format){
    if(!applyToCad(false)) return;
    if(typeof closeTransferMenus==="function") closeTransferMenus();
    if(typeof openExportSavePanel==="function"){
      openExportSavePanel(format);
    }
  }

  $("handDrawBtn")?.addEventListener("click",openPanel);
  $("closeHandDrawBtn")?.addEventListener("click",closePanel);
  $("handCameraBtn")?.addEventListener("click",triggerCamera);
  $("handGalleryBtn")?.addEventListener("click",triggerGallery);
  $("handCameraInput")?.addEventListener("change",e=>loadImageFile(e.target.files?.[0]));
  $("handGalleryInput")?.addEventListener("change",e=>loadImageFile(e.target.files?.[0]));
  $("handRecognizeBtn")?.addEventListener("click",recognize);
  $("reliableDetectBtn")?.addEventListener("click",detectReliableOutline);
  $("reliableOutlineFixBtn")?.addEventListener("click",startOutlineFix);
  $("reliableCanvas")?.addEventListener("pointerup",handleReliableTap);
  $("reliableUndoBtn")?.addEventListener("click",undoReliable);
  $("reliableFinishBtn")?.addEventListener("click",finishReliable);
  $("handBackSimpleBtn")?.addEventListener("click",backToReliable);
  $("handAssistBtn")?.addEventListener("click",openAssist);
  $("handAssistBtnTop")?.addEventListener("click",()=>{
    openAssist();
    setAssistMode("outline");
  });
  $("handAssistDoneBtn")?.addEventListener("click",closeAssist);
  $("handAssistClearBtn")?.addEventListener("click",()=>{
    state.assistPoints=[];state.assistHoleCenter=null;
    assistMessage("現在の補正操作を取り消しました。項目を選び直してください。");
    drawAssistCanvas();
  });
  document.querySelectorAll("[data-hand-assist]").forEach(btn=>{
    btn.addEventListener("click",()=>setAssistMode(btn.dataset.handAssist));
  });
  $("handAssistCanvas")?.addEventListener("pointerup",handleAssistTap);
  $("handApplyBtn")?.addEventListener("click",()=>applyToCad(false));
  $("handPdfBtn")?.addEventListener("click",()=>exportAfterReview("pdf"));
  $("handDxfBtn")?.addEventListener("click",()=>exportAfterReview("dxf"));

  ["handOuterWidth","handOuterHeight"].forEach(id=>{
    $(id)?.addEventListener("input",()=>{
      syncHolePositionsFromOuter();markMissingInputs();drawCleanPreview();
    });
  });
  $("handHoleFields")?.addEventListener("input",()=>{markMissingInputs();drawCleanPreview();});
  window.addEventListener("resize",()=>{
    if(!$("handReviewArea")?.classList.contains("hidden")) drawCleanPreview();
    if(!$("handAssistArea")?.classList.contains("hidden")) drawAssistCanvas();
    if(!$("handReliableArea")?.classList.contains("hidden")) drawReliableCanvas();
  });
})();
