
(() => {
  "use strict";

  const $ = id => document.getElementById(id);
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
    const ids=["handCameraBtn","handRecognizeBtn","handApplyBtn","handPdfBtn","handDxfBtn"];
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

  function loadImageFile(file){
    if(!file) return;
    state.fileName=(file.name||"hand-drawing").replace(/\.[^.]+$/,"");
    const url=URL.createObjectURL(file);
    const img=$("handPhotoPreview");
    img.onload=()=>{
      try{
        const maxSide=1600;
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
        state.width=null;state.height=null;state.holes=[];
        $("handPhotoArea")?.classList.remove("hidden");
        $("handReviewArea")?.classList.add("hidden");
        setStatus("撮影画像を確認してください。問題なければ「この写真を読み取る」。","ok");
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

  function clamp(v,min,max){return Math.max(min,Math.min(max,v));}
  function centerOfBox(b){return {x:(b.x0+b.x1)/2,y:(b.y0+b.y1)/2};}

  function detectGeometry(cv){
    const canvas=$("handSourceCanvas");
    const W=canvas.width,H=canvas.height;
    const mats=[];
    const keep=m=>{mats.push(m);return m;};
    let bestRect=null;
    let circleCandidates=[];
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

          if(r.width>W*.18 && r.height>H*.12 && areaRatio>.025 && areaRatio<.82 && fill>.28){
            const score=areaRatio*100 + fill*16 - centerPenalty*18 - (borderTouch?25:0);
            if(score>bestScore){
              bestScore=score;
              bestRect={x:r.x,y:r.y,w:r.width,h:r.height,source:"contour",score};
            }
          }

          const perimeter=cv.arcLength(cnt,true);
          const circularity=perimeter>0 ? (4*Math.PI*area)/(perimeter*perimeter) : 0;
          const aspect=r.height? r.width/r.height : 0;
          if(r.width>=10 && r.height>=10 && aspect>.62 && aspect<1.38 && circularity>.42){
            circleCandidates.push({cx:r.x+r.width/2,cy:r.y+r.height/2,r:(r.width+r.height)/4,quality:circularity,source:"contour"});
          }
        }finally{cnt.delete();}
      }

      const edges=keep(new cv.Mat());
      cv.Canny(blur,edges,50,150,3,false);
      const lines=keep(new cv.Mat());
      cv.HoughLinesP(edges,lines,1,Math.PI/180,45,Math.max(25,Math.min(W,H)*.10),12);
      const horizontal=[],vertical=[];
      for(let i=0;i<lines.rows;i++){
        const base=i*4;
        const x1=lines.data32S[base],y1=lines.data32S[base+1],x2=lines.data32S[base+2],y2=lines.data32S[base+3];
        const dx=x2-x1,dy=y2-y1,len=Math.hypot(dx,dy);
        if(len<25) continue;
        if(Math.abs(dy)<=len*.13) horizontal.push({x1:Math.min(x1,x2),x2:Math.max(x1,x2),y:(y1+y2)/2,len});
        if(Math.abs(dx)<=len*.13) vertical.push({y1:Math.min(y1,y2),y2:Math.max(y1,y2),x:(x1+x2)/2,len});
      }

      horizontal.sort((a,b)=>b.len-a.len);
      vertical.sort((a,b)=>b.len-a.len);
      const hs=horizontal.slice(0,12),vs=vertical.slice(0,12);
      let houghBest=null,houghScore=-Infinity;
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
          const score=(coverH+coverV)*10 + areaRatio*25 - centerPenalty*10;
          if(score>houghScore){
            houghScore=score;houghBest={x:left,y:top,w:rw,h:rh,source:"lines",score};
          }
        }
      }
      if(houghBest && (!bestRect || houghBest.score>bestRect.score*.75)){
        if(!bestRect || Math.abs((houghBest.w*houghBest.h)-(bestRect.w*bestRect.h))/(W*H)>.015){
          bestRect=houghBest;
        }
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
        const circlesMat=keep(new cv.Mat());
        const circleInput=keep(new cv.Mat());
        cv.medianBlur(gray,circleInput,5);
        try{
          cv.HoughCircles(circleInput,circlesMat,cv.HOUGH_GRADIENT,1.2,Math.max(18,minSide*.08),100,24,4,Math.max(8,Math.round(minSide*.28)));
          for(let i=0;i<circlesMat.cols;i++){
            const k=i*3;
            circleCandidates.push({cx:circlesMat.data32F[k],cy:circlesMat.data32F[k+1],r:circlesMat.data32F[k+2],quality:.75,source:"hough"});
          }
        }catch{}

        const x1=bestRect.x,y1=bestRect.y,x2=x1+bestRect.w,y2=y1+bestRect.h;
        circleCandidates=circleCandidates.filter(c=>
          c.cx>x1+3 && c.cx<x2-3 && c.cy>y1+3 && c.cy<y2-3 &&
          c.r>=Math.max(5,minSide*.018) && c.r<minSide*.32
        );
        circleCandidates.sort((a,b)=>b.quality-a.quality);
        const dedup=[];
        for(const c of circleCandidates){
          if(dedup.some(d=>Math.hypot(d.cx-c.cx,d.cy-c.cy)<Math.max(8,(d.r+c.r)*.45))) continue;
          dedup.push(c);
          if(dedup.length>=20) break;
        }
        circleCandidates=dedup;
      }
    }finally{
      mats.reverse().forEach(m=>{try{m.delete();}catch{}});
    }
    return {rect:bestRect,circles:circleCandidates};
  }

  function normalizeWordText(text){
    return String(text||"")
      .replace(/[，,]/g,".")
      .replace(/[×＊*]/g,"x")
      .replace(/[ØøΦφ⌀]/g,"D")
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

  async function recognizeWords(){
    const T=await getTesseract();
    const source=$("handSourceCanvas");
    let lastPct=-1;
    const worker=await T.createWorker("eng",1,{
      logger:m=>{
        if(m.status==="recognizing text" && Number.isFinite(m.progress)){
          const pct=Math.round(m.progress*100);
          if(pct!==lastPct){
            lastPct=pct;
            setStatus("寸法文字を認識中… "+pct+"%");
          }
        }
      }
    });
    try{
      await worker.setParameters({
        tessedit_pageseg_mode:"11",
        preserve_interword_spaces:"1",
        tessedit_char_whitelist:"0123456789.-+xXRMrmDdOoØø"
      });
      const first=await worker.recognize(source);
      let words=(first.data.words||[]).map(w=>({...w,rotation:0}));
      let raw=first.data.text||"";

      const rotated=rotatedCanvas90(source);
      setStatus("縦向きの寸法も確認しています…");
      const second=await worker.recognize(rotated);
      const rw=(second.data.words||[]).map(w=>({
        ...w,
        bbox:mapRotatedBox(w.bbox||w.boundingBox,source.width,source.height),
        rotation:90
      }));
      words=words.concat(rw);
      raw += "\n--- 縦向き確認 ---\n"+(second.data.text||"");
      return {words,raw};
    }finally{
      await worker.terminate();
    }
  }

  function chooseOuterDimensions(parsed,rect){
    const pairW=parsed.find(d=>d.kind==="pairWidth");
    const pairH=parsed.find(d=>d.kind==="pairHeight");
    if(pairW&&pairH) return {width:pairW.value,height:pairH.value,widthDim:pairW,heightDim:pairH};

    const usable=parsed.filter(d=>d.kind==="plain");
    const cx=rect.x+rect.w/2,cy=rect.y+rect.h/2;
    let bestW=null,bestWS=-Infinity,bestH=null,bestHS=-Infinity;
    for(const d of usable){
      const p=centerOfBox(d.bbox);
      const xNorm=Math.abs(p.x-cx)/Math.max(1,rect.w/2);
      const yNorm=Math.abs(p.y-cy)/Math.max(1,rect.h/2);
      const nearTopBottom=Math.min(Math.abs(p.y-rect.y),Math.abs(p.y-(rect.y+rect.h)))/Math.max(1,rect.h);
      const nearLeftRight=Math.min(Math.abs(p.x-rect.x),Math.abs(p.x-(rect.x+rect.w)))/Math.max(1,rect.w);
      const outsideV=(p.y<rect.y||p.y>rect.y+rect.h)?1:0;
      const outsideH=(p.x<rect.x||p.x>rect.x+rect.w)?1:0;
      const ws=(1-Math.min(1,xNorm))*2.2 +(1-Math.min(1,nearTopBottom))*1.8 +outsideV*.8 -(yNorm<.25?.8:0)+(d.confidence||0)/200;
      const hs=(1-Math.min(1,yNorm))*2.2 +(1-Math.min(1,nearLeftRight))*1.8 +outsideH*.8 -(xNorm<.25?.8:0)+(d.confidence||0)/200;
      if(ws>bestWS){bestWS=ws;bestW=d;}
      if(hs>bestHS){bestHS=hs;bestH=d;}
    }
    if(bestW===bestH && usable.length>1){
      const rest=usable.filter(d=>d!==bestW);
      let altH=null,altHS=-Infinity;
      for(const d of rest){
        const p=centerOfBox(d.bbox);
        const yNorm=Math.abs(p.y-cy)/Math.max(1,rect.h/2);
        const nearLeftRight=Math.min(Math.abs(p.x-rect.x),Math.abs(p.x-(rect.x+rect.w)))/Math.max(1,rect.w);
        const outsideH=(p.x<rect.x||p.x>rect.x+rect.w)?1:0;
        const hs=(1-Math.min(1,yNorm))*2.2 +(1-Math.min(1,nearLeftRight))*1.8 +outsideH*.8+(d.confidence||0)/200;
        if(hs>altHS){altHS=hs;altH=d;}
      }
      if(altH && altHS>bestHS-1.2) bestH=altH;
    }
    return {
      width:bestW&&bestWS>1.2?bestW.value:null,
      height:bestH&&bestHS>1.2?bestH.value:null,
      widthDim:bestW,
      heightDim:bestH
    };
  }

  function mapHoles(parsed,rect,circles,width,height,usedDims){
    const candidates=parsed.filter(d=>!usedDims.has(d) && (d.kind==="diameter"||d.kind==="plain"));
    return circles.map((c,index)=>{
      let best=null,bestScore=Infinity;
      for(const d of candidates){
        const p=centerOfBox(d.bbox);
        const dist=Math.hypot(p.x-c.cx,p.y-c.cy);
        const maxDist=Math.max(rect.w,rect.h)*.32;
        if(dist>maxDist) continue;
        const penalty=d.kind==="diameter"?0:maxDist*.18;
        const score=dist+penalty;
        if(score<bestScore){bestScore=score;best=d;}
      }
      if(best) usedDims.add(best);
      return {
        index:index+1,
        normX:clamp((c.cx-rect.x)/Math.max(1,rect.w),0,1),
        normY:clamp((rect.y+rect.h-c.cy)/Math.max(1,rect.h),0,1),
        x:Number.isFinite(width)?roundValue(width*clamp((c.cx-rect.x)/rect.w,0,1),2):null,
        y:Number.isFinite(height)?roundValue(height*clamp((rect.y+rect.h-c.cy)/rect.h,0,1),2):null,
        diameter:best?best.value:null,
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
            '<strong>穴 '+(i+1)+'</strong>'+
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
    setStatus(missed.length ? "認識できなかった項目があります。黄色の入力欄を確認・修正してください。" : "図面化しました。寸法と穴位置を確認してください。", missed.length?"warn":"ok");
    markMissingInputs();
    drawCleanPreview();
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
      setStatus("図形を認識しています…");
      const cv=await getOpenCV();
      const geo=detectGeometry(cv);
      if(!geo.rect) throw new Error("外形を認識できませんでした。外形線がはっきり見えるように撮影してください。");
      state.rect=geo.rect;
      state.circles=geo.circles;

      setStatus("寸法文字の認識を開始しています…");
      const ocr=await recognizeWords();
      state.rawText=ocr.raw;
      const parsed=ocr.words.flatMap(parseWord);
      state.dims=parsed;
      const outer=chooseOuterDimensions(parsed,state.rect);
      state.width=Number.isFinite(outer.width)?outer.width:null;
      state.height=Number.isFinite(outer.height)?outer.height:null;
      const used=new Set();
      if(outer.widthDim) used.add(outer.widthDim);
      if(outer.heightDim) used.add(outer.heightDim);
      state.holes=mapHoles(parsed,state.rect,state.circles,state.width,state.height,used);
      renderReview();
    }catch(err){
      console.error(err);
      setStatus(err?.message||"認識処理に失敗しました。撮影し直してください。","error");
    }finally{
      setBusy(false);
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
        result.push({id:newId(),type:"hole",cx:h.x,cy:h.y,r:h.d/2,holeKind:"through",layer:"1"});
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
  $("handRetakeBtn")?.addEventListener("click",triggerCamera);
  $("handCameraInput")?.addEventListener("change",e=>loadImageFile(e.target.files?.[0]));
  $("handRecognizeBtn")?.addEventListener("click",recognize);
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
  });
})();
