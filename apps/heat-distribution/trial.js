const TRIAL_DAYS=14;
const TRIAL_KEY='vacuum_heater_trial_start_v1';
(function(){
  const DAY=24*60*60*1000;
  const now=Date.now();
  let start=Number(localStorage.getItem(TRIAL_KEY));
  if(!Number.isFinite(start)||start<=0||start>now){
    start=now;
    localStorage.setItem(TRIAL_KEY,String(start));
  }
  const end=start+TRIAL_DAYS*DAY;
  const remainingMs=end-now;
  const remainingDays=Math.max(0,Math.ceil(remainingMs/DAY));

  const badge=document.createElement('div');
  badge.style.cssText='margin:8px 0 12px;padding:9px 12px;border:1px solid #334155;border-radius:10px;background:#0f172a;color:#e2e8f0;font-size:12px;font-weight:700;text-align:center';
  badge.textContent=remainingMs>0?`試用期間：残り ${remainingDays} 日`:'試用期間は終了しました';
  const wrap=document.querySelector('.wrap');
  if(wrap) wrap.insertBefore(badge,wrap.children[2]||null);

  if(remainingMs<=0){
    const overlay=document.createElement('div');
    overlay.style.cssText='position:fixed;inset:0;z-index:99999;background:rgba(11,18,32,.97);display:flex;align-items:center;justify-content:center;padding:24px';
    overlay.innerHTML='<div style="max-width:420px;text-align:center;color:#f8fafc"><div style="font-size:26px;font-weight:900;margin-bottom:12px">14日間の使用期限が終了しました</div><div style="font-size:14px;color:#cbd5e1;line-height:1.7">この試用版は、初回起動から14日間ご利用いただけます。</div></div>';
    document.body.appendChild(overlay);
  }
})();
