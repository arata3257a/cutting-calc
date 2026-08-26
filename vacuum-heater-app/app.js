const COLS=12, ROWS=6, PITCH=150;
let topVals=[], bottomVals=[], side='top', selected=0;

function imagePreset(){
  let a=[];
  for(let r=0;r<ROWS;r++){
    for(let c=0;c<COLS;c++){
      const edge=Math.min(r,ROWS-1-r,c,COLS-1-c);
      let v=80;
      if(edge>=1) v=70;
      if(edge>=2) v=60;
      // 中央域を少し弱める、提供画像に近い見た目
      if((c===5||c===6)&&(r===1||r===2)) v=50;
      a.push(v);
    }
  }
  return a;
}
topVals=imagePreset();
bottomVals=imagePreset();

const el=id=>document.getElementById(id);

function pctColor(p){
  // 0..100: cyan -> green -> yellow -> orange -> red
  const t=Math.max(0,Math.min(100,p))/100;
  let h=190-(190-5)*t;
  return `hsl(${h} 85% 58%)`;
}
function renderGrid(){
  const g=el('heaterGrid'); g.innerHTML='';
  const vals=side==='top'?topVals:bottomVals;
  vals.forEach((p,i)=>{
    let d=document.createElement('div');
    d.className='cell'+(i===selected?' selected':'');
    d.style.background=pctColor(p);

    const r=Math.floor(i/COLS), c=i%COLS;
    const input=document.createElement('input');
    input.type='text';
    input.inputMode='numeric';
    input.maxLength=2;
    input.value=String(Math.min(99,p)).padStart(2,'0');
    input.className='cell-input';
    input.setAttribute('aria-label', `${side==='top'?'上':'下'}ヒーター X${COLS-c} Y${ROWS-r} 出力`);

    const line=document.createElement('div');
    line.style.display='flex';
    line.style.alignItems='center';
    line.style.justifyContent='center';

    const unit=document.createElement('span');
    unit.className='cell-unit';
    unit.textContent='%';

    const meta=document.createElement('small');
    meta.textContent=`${Math.round((+el('baseTemp').value||0)*p/100)}℃ · X${COLS-c} Y${ROWS-r}`;

    line.appendChild(input);
    line.appendChild(unit);
    d.appendChild(line);
    d.appendChild(meta);

    input.addEventListener('focus',()=>{
      selected=i;
      el('selectedPct').value=vals[i];
      updateSelectedTemp();
      [...g.children].forEach((x,j)=>x.classList.toggle('selected',j===i));
      requestAnimationFrame(()=>input.select());
    });
    input.addEventListener('input',()=>{
      input.value=input.value.replace(/[^0-9]/g,'').slice(0,2);
      if(input.value.length){
        let v=Math.max(0,Math.min(99,Number(input.value)));
        vals[i]=v;
        d.style.background=pctColor(v);
        meta.textContent=`${Math.round((+el('baseTemp').value||0)*v/100)}℃ · X${COLS-c} Y${ROWS-r}`;
        selected=i;
        el('selectedPct').value=v;
        updateSelectedTemp();
      }
    });
    input.addEventListener('blur',()=>{
      let v=input.value==='' ? vals[i] : Math.max(0,Math.min(99,Number(input.value)));
      vals[i]=v;
      input.value=String(v).padStart(2,'0');
      d.style.background=pctColor(v);
      meta.textContent=`${Math.round((+el('baseTemp').value||0)*v/100)}℃ · X${COLS-c} Y${ROWS-r}`;
    });

    d.addEventListener('click',(e)=>{
      if(e.target!==input){
        selected=i;
        input.focus();
      }
    });

    g.appendChild(d);
  });
  el('selectedPct').value=vals[selected];
  updateSelectedTemp();
}
function updateSelectedTemp(){
  el('selectedTemp').value=Math.round((+el('baseTemp').value||0)*(+el('selectedPct').value||0)/100);
}
function setTab(t){
  side=t;
  el('tabTop').classList.toggle('active',t==='top');
  el('tabBottom').classList.toggle('active',t==='bottom');
  el('heaterView').classList.remove('hidden');
  el('mapView').classList.add('hidden');
  renderGrid();
}
el('tabTop').onclick=()=>setTab('top');
el('tabBottom').onclick=()=>setTab('bottom');
el('tabMap').onclick=()=>{el('heaterView').classList.add('hidden');el('mapView').classList.remove('hidden');drawHeatmap();};
el('presetImage').onclick=()=>{ if(side==='top') topVals=imagePreset(); else bottomVals=imagePreset(); renderGrid(); };
el('preset100').onclick=()=>{ if(side==='top') topVals=Array(72).fill(99); else bottomVals=Array(72).fill(99); renderGrid(); };
el('copyToOther').onclick=()=>{ if(side==='top') bottomVals=[...topVals]; else topVals=[...bottomVals]; };
el('selectedPct').oninput=updateSelectedTemp;
el('applyPct').onclick=()=>{
  let v=Math.max(0,Math.min(100,+el('selectedPct').value||0));
  (side==='top'?topVals:bottomVals)[selected]=v; renderGrid();
};
el('baseTemp').oninput=()=>{updateSelectedTemp();renderGrid();};

const MATERIALS={
  ABS:{rho:1050, cp:1470, label:'ABS', src:'代表値: 密度1.03–1.07 g/cm³、比熱1.26–1.68 J/(g·K)'},
  PC:{rho:1200, cp:1100, label:'PC', src:'代表値: 密度約1.20 g/cm³、比熱1.0–1.2 J/(g·K)'},
  APET:{rho:1340, cp:1088, label:'A-PET', src:'代表値: 密度約1.34 g/cm³、比熱0.26 cal/(g·℃)'},
  PMMAPC:{rho:1200, cp:1150, label:'PMMA+PC', src:'密度約1.20 g/cm³。比熱は製品構成で変わるため暫定値'}
};
function updateMatInfo(){
  const m=MATERIALS[el('material').value];
  el('matInfo').textContent=`${m.label} / 板厚 ${(+el('thickness').value||0.5).toFixed(1)} mm　${m.src}`;
}
function thermalResponseFactor(){
  const m=MATERIALS[el('material').value];
  const th=Math.max(0.1,+el('thickness').value||0.5)/1000;
  const arealHeatCapacity=m.rho*m.cp*th;
  const ref=1050*1470*0.0005;
  const tau=55*(arealHeatCapacity/ref);
  const t=Math.max(0,+el('heatTime').value||0);
  return 1-Math.exp(-t/Math.max(1,tau));
}

let simTimer=null;
function getCurrentSimTime(){
  return Math.max(0,+el('timeSlider').value||0);
}
function setSimTime(t){
  const maxT=Math.max(1,+el('timeSlider').max||180);
  const clamped=Math.max(0,Math.min(maxT,t));
  el('timeSlider').value=clamped;
  el('heatTime').value=Math.round(clamped);
  el('currentTimeLabel').textContent=Math.round(clamped)+'秒';
  if(!el('mapView').classList.contains('hidden')) drawHeatmap();
}
function syncSliderMax(){
  const maxT=90;
  el('timeSlider').max=maxT;
  el('maxTimeLabel').textContent='90秒';
  let ht=Math.max(0,Math.min(maxT,+el('heatTime').value||0));
  el('heatTime').value=Math.round(ht);
  if(+el('timeSlider').value>maxT) el('timeSlider').value=maxT;
}
function startSimulation(){
  if(simTimer) return;
  el('displayMode').value='equiv';
  simTimer=setInterval(()=>{
    const speed=+el('playSpeed').value||1;
    let t=getCurrentSimTime()+speed;
    if(t>=+el('timeSlider').max){
      t=+el('timeSlider').max;
      stopSimulation();
    }
    setSimTime(t);
  },250);
}
function stopSimulation(){
  if(simTimer){clearInterval(simTimer);simTimer=null;}
}

function heatAt(x,y,vals,dist,spread){
  let s=0;
  const sigma=Math.max(80,dist*0.65*spread + PITCH*0.35);
  const twoSigma2=2*sigma*sigma;
  for(let r=0;r<ROWS;r++){
    for(let c=0;c<COLS;c++){
      const hx=(c+0.5)*PITCH, hy=(r+0.5)*PITCH;
      const dx=x-hx, dy=y-hy;
      const d2=dx*dx+dy*dy;
      const lateral=Math.exp(-d2/twoSigma2);
      const atten=1/(1 + d2/(dist*dist+1));
      s += (vals[r*COLS+c]/100)*lateral*atten;
    }
  }
  return s;
}
function viridisLike(t){
  t=Math.max(0,Math.min(1,t));
  const stops=[
    [0,[20,35,90]],[.25,[0,170,220]],[.5,[40,200,110]],[.75,[250,220,50]],[1,[230,55,35]]
  ];
  for(let i=0;i<stops.length-1;i++){
    if(t>=stops[i][0] && t<=stops[i+1][0]){
      const a=stops[i],b=stops[i+1],q=(t-a[0])/(b[0]-a[0]);
      return a[1].map((v,j)=>Math.round(v+(b[1][j]-v)*q));
    }
  }
  return stops[stops.length-1][1];
}

function drawLayoutPreview(offsetX,offsetY,sheetW,sheetH){
  const cvs=el('layoutPreview'), ctx=cvs.getContext('2d');
  const W=cvs.width,H=cvs.height;
  const totalW=COLS*PITCH,totalH=ROWS*PITCH;
  const sx=W/totalW, sy=H/totalH;
  ctx.clearRect(0,0,W,H);

  const vals=topVals;
  for(let r=0;r<ROWS;r++){
    for(let c=0;c<COLS;c++){
      const p=vals[r*COLS+c];
      ctx.fillStyle=pctColor(p);
      ctx.fillRect(c*PITCH*sx,r*PITCH*sy,PITCH*sx,PITCH*sy);
      ctx.strokeStyle='rgba(255,255,255,.35)';
      ctx.strokeRect(c*PITCH*sx,r*PITCH*sy,PITCH*sx,PITCH*sy);
      ctx.fillStyle='rgba(15,23,42,.85)';
      ctx.font='bold 16px system-ui';
      ctx.textAlign='center';
      ctx.textBaseline='middle';
      ctx.fillText(p+'%',(c+.5)*PITCH*sx,(r+.5)*PITCH*sy);
    }
  }

  ctx.fillStyle='rgba(255,255,255,.18)';
  ctx.fillRect(offsetX*sx,offsetY*sy,sheetW*sx,sheetH*sy);
  ctx.strokeStyle='#ffffff';
  ctx.lineWidth=4;
  ctx.strokeRect(offsetX*sx+2,offsetY*sy+2,sheetW*sx-4,sheetH*sy-4);
  ctx.fillStyle='#ffffff';
  ctx.font='bold 18px system-ui';
  ctx.textAlign='left';
  ctx.textBaseline='top';
  ctx.fillText(`シート ${Math.round(sheetW)}×${Math.round(sheetH)} mm`,offsetX*sx+10,offsetY*sy+10);

  ctx.font='bold 14px system-ui';
  ctx.fillStyle='rgba(255,255,255,.95)';
  ctx.textAlign='left';
  ctx.fillText('← 左端',8,H-24);
  ctx.textAlign='right';
  ctx.fillText('右端 →',W-8,H-24);
  ctx.textAlign='left';
  ctx.fillText('上から ↓',8,8);
}

const SIGMA = 5.670374419e-8;

function atmosphereTempAt(t){
  const start=Math.max(-20,+el('airStartTemp').value||25);
  const maxT=Math.max(start,+el('airMaxTemp').value||90);
  const tau=Math.max(5,+el('airTau').value||60);
  return start + (maxT-start)*(1-Math.exp(-Math.max(0,t)/tau));
}

function radiationDrive(heaterC, sheetC, emissivity){
  const Th=Math.max(1,heaterC+273.15);
  const Ts=Math.max(1,sheetC+273.15);
  return Math.max(0,emissivity*SIGMA*(Math.pow(Th,4)-Math.pow(Ts,4)));
}

function convectiveDrive(airC, sheetC){
  const h=8;
  return Math.max(0,h*(airC-sheetC));
}

function materialArealHeatCapacity(){
  const m=MATERIALS[el('material').value];
  const th=Math.max(0.1,+el('thickness').value||0.5)/1000;
  return m.rho*m.cp*th;
}

function drawHeatmap(){
  const cvs=el('heatmap'), ctx=cvs.getContext('2d');
  const W=cvs.width,H=cvs.height;
  const topDist=Math.max(20,+el('topDistance').value||250);
  const bottomDist=Math.max(20,+el('bottomDistance').value||250);
  const spread=+el('spread').value||1;
  const tw=(+el('topWeight').value||0)/100, bw=(+el('bottomWeight').value||0)/100;
  const totalW=COLS*PITCH, totalH=ROWS*PITCH;
  const sheetW=Math.min(totalW,Math.max(100,+el('sheetW').value||1200));
  const sheetH=Math.min(totalH,Math.max(100,+el('sheetH').value||750));
  const offsetX=(totalW-sheetW)/2;
  const offsetY=(totalH-sheetH)/2;
  drawLayoutPreview(offsetX,offsetY,sheetW,sheetH);

  const nx=120, ny=65, arr=[];
  let mn=Infinity,mx=-Infinity;
  for(let iy=0;iy<ny;iy++){
    let row=[];
    for(let ix=0;ix<nx;ix++){
      const x=offsetX+(ix+.5)/nx*sheetW, y=offsetY+(iy+.5)/ny*sheetH;
      const v=tw*heatAt(x,y,topVals,topDist,spread)+bw*heatAt(x,y,bottomVals,bottomDist,spread);
      row.push(v); mn=Math.min(mn,v); mx=Math.max(mx,v);
    } arr.push(row);
  }
  ctx.clearRect(0,0,W,H);
  const cw=W/nx,ch=H/ny;
  const mode=el('displayMode').value;
  const base=+el('baseTemp').value||400;
  const sheetStart=+el('ambientTemp').value||25;
  const target=+el('targetTemp').value||160;
  const emiss=Math.max(0.1,Math.min(1,+el('emissivity').value||0.9));
  const simTime=getCurrentSimTime();
  const airT=atmosphereTempAt(simTime);
  const arealCap=Math.max(1,materialArealHeatCapacity());

  let tempVals=[], tmin=Infinity,tmax=-Infinity, tsum=0, overCount=0, targetCount=0;
  let radSum=0, totalHeatSum=0;

  if(mode==='equiv'){
    const dt=1;
    const steps=Math.max(1,Math.round(simTime/dt));
    const localTemps=Array.from({length:ny},()=>Array(nx).fill(sheetStart));

    for(let step=0; step<steps; step++){
      const t=(step+1)*dt;
      const airNow=atmosphereTempAt(t);
      for(let iy=0; iy<ny; iy++){
        for(let ix=0; ix<nx; ix++){
          const rel=arr[iy][ix]/(mx||1);
          const localHeaterC=sheetStart + (base-sheetStart)*Math.max(0,Math.min(1,rel));
          const Ts=localTemps[iy][ix];
          const qRad=radiationDrive(localHeaterC,Ts,emiss);
          const qConv=convectiveDrive(airNow,Ts);
          const viewFactor=0.18;
          const qNet=qRad*viewFactor + qConv;
          const dT=(qNet/arealCap)*dt;
          localTemps[iy][ix]=Math.min(base,Ts+dT);
          if(step===steps-1){
            radSum += qRad*viewFactor;
            totalHeatSum += qNet;
          }
        }
      }
    }

    tempVals=localTemps;

    for(let iy=0; iy<ny; iy++){
      for(let ix=0; ix<nx; ix++){
        const val=tempVals[iy][ix];
        tmin=Math.min(tmin,val); tmax=Math.max(tmax,val); tsum+=val;
        if(val>=target) targetCount++;
        if(val>=target+20) overCount++;
        const norm=Math.max(0,Math.min(1,(val-sheetStart)/Math.max(1,target+40-sheetStart)));
        const rgb=viridisLike(norm);
        ctx.fillStyle=`rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
        ctx.fillRect(ix*cw,iy*ch,Math.ceil(cw)+1,Math.ceil(ch)+1);
      }
    }
  }else{
    for(let iy=0;iy<ny;iy++){
      for(let ix=0;ix<nx;ix++){
        const rel=(arr[iy][ix]-mn)/(mx-mn||1);
        const rgb=viridisLike(rel);
        ctx.fillStyle=`rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
        ctx.fillRect(ix*cw,iy*ch,Math.ceil(cw)+1,Math.ceil(ch)+1);
      }
    }
  }

  ctx.strokeStyle='rgba(255,255,255,.85)';ctx.lineWidth=3;ctx.strokeRect(1.5,1.5,W-3,H-3);

  if(mode==='equiv'){
    const avg=tsum/(nx*ny);
    el('minStat').textContent=`約${tmin.toFixed(0)}℃`;
    el('maxStat').textContent=`約${tmax.toFixed(0)}℃`;
    el('rangeStat').textContent=`約${(tmax-tmin).toFixed(0)}℃`;
    el('avgTempStat').textContent=`約${avg.toFixed(0)}℃`;
    el('airTempStat').textContent=`約${airT.toFixed(0)}℃`;
    el('targetStat').textContent=(targetCount/(nx*ny)*100).toFixed(0)+'%';
    el('overheatStat').textContent=(overCount/(nx*ny)*100).toFixed(0)+'%';
    const radPct=totalHeatSum>0 ? (radSum/totalHeatSum*100) : 0;
    el('radStat').textContent=radPct.toFixed(0)+'%';

    const flat=tempVals.flat(), mean=avg;
    const sd=Math.sqrt(flat.reduce((a,b)=>a+(b-mean)*(b-mean),0)/flat.length);
    const uniform=Math.max(0,100-(sd/Math.max(1,mean-sheetStart)*100));
    el('uniformStat').textContent=uniform.toFixed(1)+'%';
    el('uniformStat2').textContent=uniform.toFixed(1)+'%';

    const gaugeLow=Math.floor(Math.min(sheetStart,tmin)/10)*10;
    const gaugeHigh=Math.ceil(Math.max(target+40,tmax)/10)*10;
    el('gaugeMin').textContent=gaugeLow+'℃';
    el('gaugeMax').textContent=gaugeHigh+'℃';
    el('gaugeTarget').textContent='目標 '+target.toFixed(0)+'℃';
    const markerPct=Math.max(0,Math.min(100,(target-gaugeLow)/Math.max(1,gaugeHigh-gaugeLow)*100));
    el('targetMarker').style.left=`calc(${markerPct}% - 1px)`;
  }else{
    el('minStat').textContent=(mn/mx*100).toFixed(1)+'%';
    el('maxStat').textContent='100%';
    el('rangeStat').textContent=(100-mn/mx*100).toFixed(1)+'pt';
    const valsFlat=arr.flat(), mean=valsFlat.reduce((a,b)=>a+b,0)/valsFlat.length;
    const sd=Math.sqrt(valsFlat.reduce((a,b)=>a+(b-mean)*(b-mean),0)/valsFlat.length);
    const uniform=Math.max(0,100-(sd/mean*100));
    el('uniformStat').textContent=uniform.toFixed(1)+'%';
    el('uniformStat2').textContent=uniform.toFixed(1)+'%';
    el('avgTempStat').textContent='-';
    el('airTempStat').textContent='-';
    el('radStat').textContent='-';
    el('targetStat').textContent='-';
    el('overheatStat').textContent='-';
    el('gaugeMin').textContent='低';
    el('gaugeMax').textContent='高';
    el('gaugeTarget').textContent='温度予測表示で℃ゲージ';
    el('targetMarker').style.left='50%';
  }
  el('timeStat').textContent=Math.round(getCurrentSimTime())+'秒';
}

['topDistance','bottomDistance','sheetW','sheetH','material','thickness','heatTime','ambientTemp','airStartTemp','airMaxTemp','airTau','targetTemp','emissivity','topWeight','bottomWeight','spread','displayMode'].forEach(id=>{
  el(id).addEventListener('input',()=>{ if(!el('mapView').classList.contains('hidden')) drawHeatmap();});
});

el('playBtn').onclick=()=>startSimulation();
el('pauseBtn').onclick=()=>stopSimulation();
el('resetBtn').onclick=()=>{stopSimulation();setSimTime(0);};
el('timeSlider').oninput=()=>{
  stopSimulation();
  el('heatTime').value=Math.round(+el('timeSlider').value);
  el('currentTimeLabel').textContent=Math.round(+el('timeSlider').value)+'秒';
  if(!el('mapView').classList.contains('hidden')) drawHeatmap();
};
el('heatTime').addEventListener('input',()=>{
  let v=Math.max(0,Math.min(90,+el('heatTime').value||0));
  el('heatTime').value=Math.round(v);
  syncSliderMax();
  el('timeSlider').value=v;
  el('currentTimeLabel').textContent=Math.round(v)+'秒';
  if(!el('mapView').classList.contains('hidden')) drawHeatmap();
});
syncSliderMax();
el('timeSlider').value=Math.min(+el('timeSlider').max,+el('heatTime').value||60);
el('currentTimeLabel').textContent=Math.round(+el('timeSlider').value)+'秒';

renderGrid();
updateMatInfo();
el('material').addEventListener('change',updateMatInfo);
el('thickness').addEventListener('input',updateMatInfo);

if('serviceWorker' in navigator){ navigator.serviceWorker.register('./service-worker.js').catch(()=>{}); }
