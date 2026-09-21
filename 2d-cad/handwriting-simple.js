
(() => {
  "use strict";

  const $ = id => document.getElementById(id);
  const TAP_DRILL = {3:2.5,4:3.3,5:4.2,6:5.0,8:6.8,10:8.5,12:10.2};

  const state = {
    imageReady:false,
    sourceCanvas:null,
    outer:null,
    dragStart:null,
    dragNow:null,
    dragging:false,
    holes:[],
    fileName:""
  };

  function status(message,kind=""){
    const el=$("handStatus");
    if(!el) return;
    el.textContent=message;
    el.dataset.kind=kind;
  }

  function numberValue(id){
    const raw=String($(id)?.value??"").trim();
    if(raw==="") return NaN;
    const v=Number(raw);
    return Number.isFinite(v)?v:NaN;
  }

  function clamp(v,min,max){return Math.max(min,Math.min(max,v));}
  function round(v,d=2){const p=10**d;return Math.round(v*p)/p;}

  function openPanel(){$("handDrawPanel")?.classList.remove("hidden");}
  function closePanel(){$("handDrawPanel")?.classList.add("hidden");}

  function triggerInput(id){
    const input=$(id);
    if(!input) return;
    input.value="";
    input.click();
  }

  function resetWorkflow(){
    state.outer=null;
    state.dragStart=null;
    state.dragNow=null;
    state.dragging=false;
    state.holes=[];
    $("handSimpleReview")?.classList.add("hidden");
    $("handSimpleWork")?.classList.remove("hidden");
    $("simpleHoleArea")?.classList.add("hidden");
    $("simpleRedoOutlineBtn")?.classList.add("hidden");
    renderHoleList();
    drawPhoto();
  }

  function loadImageFile(file){
    if(!file) return;
    state.fileName=(file.name||"hand-drawing").replace(/\.[^.]+$/,"");
    const url=URL.createObjectURL(file);
    const img=$("handPhotoPreview");
    img.onload=()=>{
      try{
        const maxSide=1400;
        const ratio=Math.min(1,maxSide/Math.max(img.naturalWidth||1,img.naturalHeight||1));
        const w=Math.max(1,Math.round(img.naturalWidth*ratio));
        const h=Math.max(1,Math.round(img.naturalHeight*ratio));
        const source=document.createElement("canvas");
        source.width=w;source.height=h;
        const g=source.getContext("2d");
        g.fillStyle="#fff";g.fillRect(0,0,w,h);
        g.drawImage(img,0,0,w,h);
        state.sourceCanvas=source;
        state.imageReady=true;
        $("handSimpleWork")?.classList.remove("hidden");
        resetWorkflow();
        status("幅・高さを入力して、写真の外形を指で囲んでください。","ok");
        setTimeout(drawPhoto,0);
      }finally{
        URL.revokeObjectURL(url);
      }
    };
    img.onerror=()=>{
      URL.revokeObjectURL(url);
      status("画像を開けませんでした。別の画像を選んでください。","error");
    };
    img.src=url;
    openPanel();
  }

  function resizeCanvasToSource(canvas){
    if(!state.sourceCanvas||!canvas) return;
    canvas.width=state.sourceCanvas.width;
    canvas.height=state.sourceCanvas.height;
  }

  function normalizedRect(a,b){
    return {
      x:Math.min(a.x,b.x),
      y:Math.min(a.y,b.y),
      w:Math.abs(b.x-a.x),
      h:Math.abs(b.y-a.y)
    };
  }

  function drawPhoto(){
    const canvas=$("simplePhotoCanvas");
    if(!canvas||!state.sourceCanvas) return;
    resizeCanvasToSource(canvas);
    const g=canvas.getContext("2d");
    g.clearRect(0,0,canvas.width,canvas.height);
    g.drawImage(state.sourceCanvas,0,0);
    const lw=Math.max(2,canvas.width/320);

    const rect=state.dragging&&state.dragStart&&state.dragNow
      ? normalizedRect(state.dragStart,state.dragNow)
      : state.outer;

    if(rect){
      g.save();
      g.lineWidth=lw*2.2;
      g.strokeStyle="#157c3c";
      g.setLineDash([lw*5,lw*3]);
      g.strokeRect(rect.x,rect.y,rect.w,rect.h);
      g.setLineDash([]);
      g.fillStyle="#157c3c";
      g.font=Math.max(14,canvas.width/44)+"px system-ui";
      g.fillText("外形",rect.x+lw*3,Math.max(18,rect.y-lw*3));
      g.restore();
    }

    if(state.holes.length){
      g.save();
      g.strokeStyle="#b32323";
      g.fillStyle="#b32323";
      g.lineWidth=lw*2;
      g.font=Math.max(13,canvas.width/46)+"px system-ui";
      for(const hole of state.holes){
        const p=hole.photo;
        g.beginPath();
        g.arc(p.x,p.y,lw*5,0,Math.PI*2);
        g.stroke();
        g.beginPath();
        g.moveTo(p.x-lw*7,p.y);g.lineTo(p.x+lw*7,p.y);
        g.moveTo(p.x,p.y-lw*7);g.lineTo(p.x,p.y+lw*7);
        g.stroke();
        g.fillText(hole.label,p.x+lw*8,p.y-lw*6);
      }
      g.restore();
    }
  }

  function pointOnCanvas(e){
    const canvas=$("simplePhotoCanvas");
    const r=canvas.getBoundingClientRect();
    return {
      x:clamp((e.clientX-r.left)/Math.max(1,r.width)*canvas.width,0,canvas.width),
      y:clamp((e.clientY-r.top)/Math.max(1,r.height)*canvas.height,0,canvas.height)
    };
  }

  function validSize(){
    const w=numberValue("simpleWidth");
    const h=numberValue("simpleHeight");
    if(!(w>0)||!(h>0)){
      status("先に幅と高さを入力してください。","warn");
      return false;
    }
    return true;
  }

  function onPointerDown(e){
    if(!state.imageReady) return;

    if(!state.outer){
      if(!validSize()) return;
      state.dragging=true;
      state.dragStart=pointOnCanvas(e);
      state.dragNow=state.dragStart;
      $("simplePhotoCanvas")?.setPointerCapture?.(e.pointerId);
      status("そのまま右下まで指を動かして離してください。");
      drawPhoto();
      return;
    }

    addHole(pointOnCanvas(e));
  }

  function onPointerMove(e){
    if(!state.dragging) return;
    state.dragNow=pointOnCanvas(e);
    drawPhoto();
  }

  function onPointerUp(e){
    if(!state.dragging) return;
    state.dragNow=pointOnCanvas(e);
    const rect=normalizedRect(state.dragStart,state.dragNow);
    state.dragging=false;
    state.dragStart=null;
    state.dragNow=null;

    const minW=Math.max(30,(state.sourceCanvas?.width||300)*.08);
    const minH=Math.max(30,(state.sourceCanvas?.height||300)*.08);
    if(rect.w<minW||rect.h<minH){
      state.outer=null;
      status("外形が小さすぎます。左上から右下へもう一度なぞってください。","warn");
      drawPhoto();
      return;
    }

    state.outer=rect;
    state.holes=[];
    $("simpleHoleArea")?.classList.remove("hidden");
    $("simpleRedoOutlineBtn")?.classList.remove("hidden");
    renderHoleList();
    status("外形を設定しました。穴種類・サイズを選んで、穴中心をタップしてください。","ok");
    drawPhoto();
  }

  function redoOutline(){
    state.outer=null;
    state.holes=[];
    state.dragging=false;
    $("simpleHoleArea")?.classList.add("hidden");
    $("simpleRedoOutlineBtn")?.classList.add("hidden");
    renderHoleList();
    status("外形の左上から右下へ、指で1回なぞってください。");
    drawPhoto();
  }

  function currentHoleSetting(){
    const kind=$("simpleHoleKind")?.value||"through";
    const size=numberValue("simpleHoleSize");
    if(!(size>0)){
      status("穴サイズを入力してください。","warn");
      return null;
    }
    return {kind,size};
  }

  function addHole(p){
    if(!state.outer) return;
    const set=currentHoleSetting();
    if(!set) return;

    const r=state.outer;
    if(p.x<r.x||p.x>r.x+r.w||p.y<r.y||p.y>r.y+r.h){
      status("緑の外形の内側にある穴中心をタップしてください。","warn");
      return;
    }

    const width=numberValue("simpleWidth");
    const height=numberValue("simpleHeight");
    if(!(width>0)||!(height>0)) return;

    const normX=(p.x-r.x)/r.w;
    const normY=(r.y+r.h-p.y)/r.h;
    const x=width*normX;
    const y=height*normY;

    const isThread=set.kind==="thread";
    const diameter=isThread?(TAP_DRILL[set.size]||set.size):set.size;
    const label=isThread?("M"+set.size):("Ø"+set.size);

    state.holes.push({
      photo:{x:p.x,y:p.y},
      x,y,normX,normY,
      diameter,
      holeKind:isThread?("M"+set.size):"through",
      threadSize:isThread?set.size:null,
      label
    });

    renderHoleList();
    drawPhoto();
    status(label+" を追加しました。次の穴も同じようにタップできます。","ok");
  }

  function renderHoleList(){
    const list=$("simpleHoleList");
    if(!list) return;
    if(!state.holes.length){
      list.innerHTML='<div class="hand-empty">穴はまだありません。</div>';
      return;
    }
    list.innerHTML=state.holes.map((h,i)=>
      '<div class="simple-hole-position" data-hole-index="'+i+'">'+
        '<div class="simple-hole-position-head"><strong>穴'+(i+1)+' '+h.label+'</strong><span>穴中心位置</span></div>'+
        '<div class="simple-hole-position-inputs">'+
          '<label>左から X mm<input class="simple-hole-x" type="number" inputmode="decimal" step="any" value="'+round(h.x,2)+'"></label>'+
          '<label>下から Y mm<input class="simple-hole-y" type="number" inputmode="decimal" step="any" value="'+round(h.y,2)+'"></label>'+
        '</div>'+
      '</div>'
    ).join("");
  }

  function updateHolePositionFromInput(row){
    const i=Number(row?.dataset?.holeIndex);
    const h=state.holes[i];
    if(!h||!state.outer) return;
    const width=numberValue("simpleWidth");
    const height=numberValue("simpleHeight");
    if(!(width>0)||!(height>0)) return;

    const xInput=row.querySelector(".simple-hole-x");
    const yInput=row.querySelector(".simple-hole-y");
    let x=Number(xInput?.value);
    let y=Number(yInput?.value);
    if(!Number.isFinite(x)||!Number.isFinite(y)) return;

    x=clamp(x,0,width);
    y=clamp(y,0,height);
    if(xInput) xInput.value=round(x,2);
    if(yInput) yInput.value=round(y,2);

    h.x=x;
    h.y=y;
    h.normX=width?x/width:0;
    h.normY=height?y/height:0;
    h.photo={
      x:state.outer.x+h.normX*state.outer.w,
      y:state.outer.y+state.outer.h-h.normY*state.outer.h
    };
    drawPhoto();
    if(!$("handSimpleReview")?.classList.contains("hidden")) drawCadPreview();
    status(h.label+" の穴位置を X="+round(x,2)+" / Y="+round(y,2)+" mm に変更しました。","ok");
  }

  function undoHole(){
    if(!state.holes.length){
      status("戻す穴はありません。");
      return;
    }
    state.holes.pop();
    renderHoleList();
    drawPhoto();
    status("最後の穴を1つ戻しました。");
  }

  function setHoleChip(btn){
    const kind=btn.dataset.holeKind;
    const size=Number(btn.dataset.holeSize);
    if(kind) $("simpleHoleKind").value=kind;
    if(Number.isFinite(size)) $("simpleHoleSize").value=size;
    document.querySelectorAll(".simple-hole-chips button").forEach(b=>b.classList.toggle("active",b===btn));
    status((kind==="thread"?"M":"Ø")+size+" を選択しました。穴中心をタップしてください。","ok");
  }

  function drawCadPreview(){
    const canvas=$("simpleCadPreview");
    if(!canvas) return;

    const width=numberValue("simpleWidth");
    const height=numberValue("simpleHeight");
    if(!(width>0)||!(height>0)) return;

    const box=canvas.getBoundingClientRect();
    const dpr=window.devicePixelRatio||1;
    const cssW=Math.max(300,Math.round(box.width||320));
    const cssH=Math.max(260,Math.min(520,Math.round(cssW*.82)));
    canvas.width=Math.round(cssW*dpr);
    canvas.height=Math.round(cssH*dpr);
    canvas.style.height=cssH+"px";

    const g=canvas.getContext("2d");
    g.setTransform(dpr,0,0,dpr,0,0);
    g.fillStyle="#fff";g.fillRect(0,0,cssW,cssH);
    g.strokeStyle="#1e2935";g.fillStyle="#1e2935";g.lineWidth=2;

    const pad=92;
    const s=Math.min((cssW-pad*2)/width,(cssH-pad*2)/height);
    const ox=(cssW-width*s)/2;
    const oy=(cssH+height*s)/2;
    const P=(x,y)=>({x:ox+x*s,y:oy-y*s});

    const a=P(0,0),b=P(width,height);
    g.strokeRect(a.x,b.y,width*s,height*s);

    g.font="600 13px system-ui";
    g.textAlign="center";g.textBaseline="middle";

    const topY=b.y-22;
    g.beginPath();
    g.moveTo(a.x,b.y-10);g.lineTo(a.x,topY);
    g.moveTo(a.x+width*s,b.y-10);g.lineTo(a.x+width*s,topY);
    g.moveTo(a.x,topY);g.lineTo(a.x+width*s,topY);
    g.stroke();
    g.fillStyle="#fff";g.fillRect(cssW/2-35,topY-10,70,20);
    g.fillStyle="#1e2935";g.fillText(round(width)+" mm",cssW/2,topY);

    const leftX=a.x-28;
    g.beginPath();
    g.moveTo(a.x-10,a.y);g.lineTo(leftX,a.y);
    g.moveTo(a.x-10,b.y);g.lineTo(leftX,b.y);
    g.moveTo(leftX,a.y);g.lineTo(leftX,b.y);
    g.stroke();
    g.save();
    g.translate(leftX,(a.y+b.y)/2);g.rotate(-Math.PI/2);
    g.fillStyle="#fff";g.fillRect(-35,-10,70,20);
    g.fillStyle="#1e2935";g.fillText(round(height)+" mm",0,0);
    g.restore();

    const holeDimFont="600 11px system-ui";
    state.holes.forEach((hole,i)=>{
      const p=P(hole.x,hole.y);
      const rr=Math.max(4,(hole.diameter/2)*s);
      g.beginPath();g.arc(p.x,p.y,rr,0,Math.PI*2);g.stroke();
      g.beginPath();
      g.moveTo(p.x-7,p.y);g.lineTo(p.x+7,p.y);
      g.moveTo(p.x,p.y-7);g.lineTo(p.x,p.y+7);
      g.stroke();
      g.fillStyle="#fff";g.fillRect(p.x-30,p.y-rr-24,60,18);
      g.fillStyle="#1e2935";g.font="600 13px system-ui";g.fillText(hole.label,p.x,p.y-rr-15);

      // X dimension: from left edge to hole center.
      const dimY=a.y+24+i*18;
      g.lineWidth=1.2;
      g.beginPath();
      g.moveTo(a.x,p.y);g.lineTo(a.x,dimY);
      g.moveTo(p.x,p.y);g.lineTo(p.x,dimY);
      g.moveTo(a.x,dimY);g.lineTo(p.x,dimY);
      g.stroke();
      g.font=holeDimFont;
      const xText="X "+round(hole.x,2);
      const xMid=(a.x+p.x)/2;
      g.fillStyle="#fff";g.fillRect(xMid-26,dimY-8,52,16);
      g.fillStyle="#1e2935";g.fillText(xText,xMid,dimY);

      // Y dimension: from bottom edge to hole center.
      const dimX=a.x+width*s+24+i*18;
      g.beginPath();
      g.moveTo(p.x,a.y);g.lineTo(dimX,a.y);
      g.moveTo(p.x,p.y);g.lineTo(dimX,p.y);
      g.moveTo(dimX,a.y);g.lineTo(dimX,p.y);
      g.stroke();
      const yText="Y "+round(hole.y,2);
      const yMid=(a.y+p.y)/2;
      g.save();
      g.translate(dimX,yMid);g.rotate(-Math.PI/2);
      g.fillStyle="#fff";g.fillRect(-26,-8,52,16);
      g.fillStyle="#1e2935";g.fillText(yText,0,0);
      g.restore();
    });
  }

  function preview(){
    if(!state.outer){
      status("先に外形を囲んでください。","warn");
      return;
    }
    if(!validSize()) return;
    $("handSimpleWork")?.classList.add("hidden");
    $("handSimpleReview")?.classList.remove("hidden");
    drawCadPreview();
    status("図面プレビューを確認してください。","ok");
    $("handSimpleReview")?.scrollIntoView({behavior:"smooth",block:"start"});
  }

  function backToEdit(){
    $("handSimpleReview")?.classList.add("hidden");
    $("handSimpleWork")?.classList.remove("hidden");
    setTimeout(drawPhoto,0);
    status("修正できます。");
  }

  function buildCadShapes(){
    const width=numberValue("simpleWidth");
    const height=numberValue("simpleHeight");
    if(!(width>0)||!(height>0)) return null;

    const result=[
      {id:newId(),type:"rect",x:0,y:0,w:width,h:height,corners:{},layer:"0"}
    ];

    for(const h of state.holes){
      result.push({
        id:newId(),
        type:"hole",
        cx:h.x,cy:h.y,
        r:h.diameter/2,
        holeKind:h.holeKind,
        layer:"1"
      });
    }

    const off=Math.max(8,Math.min(width,height)*.12);
    result.push({
      id:newId(),type:"dim",
      x1:0,y1:0,x2:width,y2:0,
      tx:width/2,ty:-off,mode:"horizontal",layer:"2"
    });
    result.push({
      id:newId(),type:"dim",
      x1:0,y1:0,x2:0,y2:height,
      tx:-off,ty:height/2,mode:"vertical",layer:"2"
    });

    // Hole-center dimensions: X from left edge, Y from bottom edge.
    state.holes.forEach((h,i)=>{
      const dimOff=off*(2+i*.75);
      result.push({
        id:newId(),type:"dim",
        x1:0,y1:h.y,x2:h.x,y2:h.y,
        tx:h.x/2,ty:-dimOff,mode:"horizontal",layer:"2"
      });
      result.push({
        id:newId(),type:"dim",
        x1:h.x,y1:0,x2:h.x,y2:h.y,
        tx:width+dimOff,ty:h.y/2,mode:"vertical",layer:"2"
      });
    });
    return result;
  }

  function applyToCad(){
    const result=buildCadShapes();
    if(!result) return false;
    shapes=result;
    selectedId=null;
    selectedIds.clear();
    snapshot();
    setTool("select");
    fitView();
    if(typeof hint!=="undefined"&&hint) hint.textContent="手書き図面をCAD化しました";
    return true;
  }

  function exportFormat(format){
    if(!applyToCad()) return;
    closePanel();
    if(typeof closeTransferMenus==="function") closeTransferMenus();
    openExportSavePanel(format);
  }

  $("handDrawBtn")?.addEventListener("click",openPanel);
  $("closeHandDrawBtn")?.addEventListener("click",closePanel);
  $("handCameraBtn")?.addEventListener("click",()=>triggerInput("handCameraInput"));
  $("handGalleryBtn")?.addEventListener("click",()=>triggerInput("handGalleryInput"));
  $("handCameraInput")?.addEventListener("change",e=>loadImageFile(e.target.files?.[0]));
  $("handGalleryInput")?.addEventListener("change",e=>loadImageFile(e.target.files?.[0]));

  const photoCanvas=$("simplePhotoCanvas");
  photoCanvas?.addEventListener("pointerdown",onPointerDown);
  photoCanvas?.addEventListener("pointermove",onPointerMove);
  photoCanvas?.addEventListener("pointerup",onPointerUp);
  photoCanvas?.addEventListener("pointercancel",()=>{
    state.dragging=false;state.dragStart=null;state.dragNow=null;drawPhoto();
  });

  $("simpleRedoOutlineBtn")?.addEventListener("click",redoOutline);
  $("simpleUndoHoleBtn")?.addEventListener("click",undoHole);
  $("simpleHoleList")?.addEventListener("change",e=>{
    const row=e.target.closest(".simple-hole-position");
    if(row && (e.target.classList.contains("simple-hole-x")||e.target.classList.contains("simple-hole-y"))){
      updateHolePositionFromInput(row);
    }
  });
  $("simplePreviewBtn")?.addEventListener("click",preview);
  $("simpleBackBtn")?.addEventListener("click",backToEdit);
  $("simplePdfBtn")?.addEventListener("click",()=>exportFormat("pdf"));
  $("simpleDxfBtn")?.addEventListener("click",()=>exportFormat("dxf"));

  document.querySelectorAll(".simple-hole-chips button").forEach(btn=>{
    btn.addEventListener("click",()=>setHoleChip(btn));
  });

  ["simpleWidth","simpleHeight"].forEach(id=>{
    $(id)?.addEventListener("input",()=>{
      if(state.outer){
        for(const h of state.holes){
          const w=numberValue("simpleWidth");
          const hh=numberValue("simpleHeight");
          if(w>0) h.x=w*h.normX;
          if(hh>0) h.y=hh*h.normY;
        }
        renderHoleList();
      }
      if(!$("handSimpleReview")?.classList.contains("hidden")) drawCadPreview();
    });
  });

  window.addEventListener("resize",()=>{
    if(state.imageReady && !$("handSimpleWork")?.classList.contains("hidden")) drawPhoto();
    if(!$("handSimpleReview")?.classList.contains("hidden")) drawCadPreview();
  });
})();
