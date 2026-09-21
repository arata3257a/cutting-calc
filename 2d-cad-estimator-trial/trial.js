(()=>{
  const KEY="easy-2d-cad-estimator-trial-period-v1";
  const DURATION_MS=7*24*60*60*1000;

  function readState(){
    try{
      const raw=JSON.parse(localStorage.getItem(KEY)||"null");
      if(raw && Number.isFinite(raw.startedAt) && Number.isFinite(raw.lastSeenAt)) return raw;
    }catch{}
    return null;
  }

  function writeState(state){
    try{localStorage.setItem(KEY,JSON.stringify(state))}catch{}
  }

  const realNow=Date.now();
  let state=readState();
  if(!state){
    state={startedAt:realNow,lastSeenAt:realNow};
  }
  const effectiveNow=Math.max(realNow,state.lastSeenAt||realNow);
  state.lastSeenAt=effectiveNow;
  writeState(state);

  function status(){
    const now=Math.max(Date.now(),state.lastSeenAt||0);
    if(now>state.lastSeenAt){
      state.lastSeenAt=now;
      writeState(state);
    }
    const expiresAt=state.startedAt+DURATION_MS;
    const remainingMs=expiresAt-now;
    return {
      expired:remainingMs<=0,
      remainingMs,
      remainingDays:Math.max(0,Math.ceil(remainingMs/(24*60*60*1000))),
      expiresAt
    };
  }

  function mount(){
    const s=status();
    const badge=document.createElement("div");
    badge.id="trialPeriodBadge";
    badge.setAttribute("aria-live","polite");
    document.body.appendChild(badge);

    const style=document.createElement("style");
    style.textContent=`
      #trialPeriodBadge{
        position:fixed;z-index:9990;right:8px;top:78px;
        background:#fff4d6;color:#6b4a00;border:1px solid #e4bf59;
        border-radius:999px;padding:6px 10px;font-size:12px;font-weight:800;
        box-shadow:0 3px 12px rgba(0,0,0,.12);pointer-events:none
      }
      #trialExpiredOverlay{
        position:fixed;inset:0;z-index:99999;background:rgba(244,246,248,.98);
        display:flex;align-items:center;justify-content:center;padding:24px
      }
      #trialExpiredCard{
        width:min(420px,100%);background:#fff;border:1px solid #dfe4e8;
        border-radius:18px;padding:24px;text-align:center;
        box-shadow:0 12px 36px rgba(0,0,0,.18)
      }
      #trialExpiredCard h2{margin:0 0 10px;font-size:22px}
      #trialExpiredCard p{margin:0;color:#5c6772;line-height:1.65}
      @media(max-width:520px){#trialPeriodBadge{top:72px;right:68px;font-size:11px}}
    `;
    document.head.appendChild(style);

    function render(){
      const x=status();
      badge.textContent=x.expired?"お試し期間終了":"1週間お試し・残り"+x.remainingDays+"日";
      if(x.expired && !document.getElementById("trialExpiredOverlay")){
        const overlay=document.createElement("div");
        overlay.id="trialExpiredOverlay";
        overlay.innerHTML=`
          <div id="trialExpiredCard">
            <h2>1週間のお試し期間が終了しました</h2>
            <p>このお試し版は初回起動から7日間利用できます。</p>
          </div>`;
        document.body.appendChild(overlay);
      }
    }

    render();
    setInterval(render,60*1000);
  }

  if(document.readyState==="loading") document.addEventListener("DOMContentLoaded",mount,{once:true});
  else mount();
})();