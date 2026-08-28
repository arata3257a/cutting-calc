(()=>{
'use strict';
const $=id=>document.getElementById(id);
const val=id=>Number($(id)?.value||0);
function getRefRange(mat){
  const m=window.EXTRA_CONDITIONS?.materials?.[mat];
  if(!m?.series)return null;
  const vcs=[],fzs=[];
  Object.values(m.series).forEach(s=>{
    const z=Number(s.flutes||0);
    (s.rows||[]).forEach(r=>{
      if(r.d&&r.n){vcs.push(Math.PI*r.d*r.n/1000)}
      if(z&&r.n){['sideF','slotF','finishF'].forEach(k=>{if(Number(r[k])>0)fzs.push(Number(r[k])/(r.n*z))})}
    })
  });
  if(!vcs.length&&!fzs.length)return null;
  return {vcMin:Math.min(...vcs),vcMax:Math.max(...vcs),fzMin:fzs.length?Math.min(...fzs):0,fzMax:fzs.length?Math.max(...fzs):0};
}
function add(arr,level,text){arr.push({level,text})}
function check(){
  const box=$('conditionWarningBox');if(!box)return;
  const d=val('d'),z=val('z'),vc=val('vc'),fz=val('fz'),ap=val('ap'),ae=val('ae'),stick=val('stick'),maxn=val('maxn');
  const mat=$('mat')?.value||'';
  if(!(d>0&&z>0&&vc>0&&fz>0)){box.className='cw-box cw-yellow';box.innerHTML='<div class="cw-title">⚠ 条件チェック</div><div class="cw-line">工具径・刃数・Vc・fzを入力してください。</div>';return}
  const issues=[];
  const ld=stick/d,apr=ap/d,aer=ae/d;
  if(ae>d*1.05)add(issues,'red',`径方向切込み ae が工具径を超えています（ae/D ${Math.round(aer*100)}%）`);
  else if(ae>d*.75)add(issues,'yellow',`径方向切込み ae が大きめです（ae/D ${Math.round(aer*100)}%）`);
  if(ap>d*6)add(issues,'red',`軸方向切込み ap が非常に大きいです（ap/D ${apr.toFixed(1)}倍）`);
  else if(ap>d*4)add(issues,'yellow',`軸方向切込み ap が大きめです（ap/D ${apr.toFixed(1)}倍）`);
  if(ld>7)add(issues,'red',`突出し比 L/D が ${ld.toFixed(1)} です。ビビり・折損リスクが高くなります`);
  else if(ld>5)add(issues,'yellow',`突出し比 L/D が ${ld.toFixed(1)} です。剛性低下に注意してください`);
  const ref=getRefRange(mat);
  if(ref){
    if(ref.vcMax&&vc>ref.vcMax*2.5)add(issues,'red',`Vc ${vc} m/min は登録済みメーカー条件の上限から大きく外れています`);
    else if(ref.vcMax&&vc>ref.vcMax*1.6)add(issues,'yellow',`Vc ${vc} m/min は登録済みメーカー条件よりかなり高めです`);
    if(ref.fzMax&&fz>ref.fzMax*2.5)add(issues,'red',`fz ${fz} mm/刃 は登録済みメーカー条件の上限から大きく外れています`);
    else if(ref.fzMax&&fz>ref.fzMax*1.6)add(issues,'yellow',`fz ${fz} mm/刃 は登録済みメーカー条件よりかなり大きめです`);
    if(ref.fzMin&&fz<ref.fzMin*.2)add(issues,'yellow',`fz ${fz} mm/刃 は登録済みメーカー条件より極端に小さく、擦り加工に注意が必要です`);
  }else{
    if(vc>1200)add(issues,'red',`Vc ${vc} m/min は非常に高い設定です`);else if(vc>800)add(issues,'yellow',`Vc ${vc} m/min は高い設定です`);
    if(fz>.5)add(issues,'red',`fz ${fz} mm/刃 は非常に大きい設定です`);else if(fz>.25)add(issues,'yellow',`fz ${fz} mm/刃 は大きい設定です`);
  }
  const calcN=Math.round(vc*1000/(Math.PI*d));
  if(maxn>0&&calcN>maxn*2)add(issues,'yellow',`Vcからの計算回転数は約 ${calcN.toLocaleString()} rpm。機械最高回転数 ${maxn.toLocaleString()} rpm を大きく超えています`);
  const red=issues.some(x=>x.level==='red'),yellow=issues.some(x=>x.level==='yellow');
  if(!issues.length){box.className='cw-box cw-green';box.innerHTML='<div class="cw-title">✓ 条件チェック</div><div class="cw-line">入力値に大きな異常は見当たりません。</div><div class="cw-note">※工具仕様・保持剛性・機械・クーラント等で許容条件は変わります。</div>';return}
  box.className='cw-box '+(red?'cw-red':'cw-yellow');
  box.innerHTML=`<div class="cw-title">${red?'⚠ 条件が極端です':'△ 条件を確認してください'}</div>${issues.map(x=>`<div class="cw-line ${x.level==='red'?'cw-strong':''}">・${x.text}</div>`).join('')}<div class="cw-note">※安全/危険の断定ではなく、一般的な比率とEXTRA登録済み条件からの目安です。</div>`;
}
function build(){
  if($('conditionWarningBox'))return;
  const style=document.createElement('style');
  style.textContent='.cw-box{margin:12px 0 0;padding:12px;border-radius:11px;border:1px solid;font-size:12px;line-height:1.55}.cw-title{font-size:14px;font-weight:900;margin-bottom:5px}.cw-line{overflow-wrap:anywhere}.cw-note{margin-top:7px;font-size:10px;opacity:.82}.cw-green{background:#263b31;border-color:#5da874;color:#c9f3d5}.cw-yellow{background:#433d25;border-color:#d4af37;color:#ffe394}.cw-red{background:#472f34;border-color:#e06a78;color:#ffc1c8}.cw-strong{font-weight:900;color:#ffd3d8}';
  document.head.appendChild(style);
  const cards=[...document.querySelectorAll('main>.card')];
  const result=cards.find(c=>(c.querySelector('.sec')?.textContent||'').trim()==='使用条件');
  if(!result)return;
  const box=document.createElement('div');box.id='conditionWarningBox';box.className='cw-box cw-green';
  const msg=$('msg');if(msg)msg.insertAdjacentElement('afterend',box);else result.appendChild(box);
  ['d','z','vc','fz','ap','ae','stick','maxn','mat','op','mode'].forEach(id=>{const e=$(id);if(e){e.addEventListener('input',()=>setTimeout(check,0));e.addEventListener('change',()=>setTimeout(check,0))}});
  document.addEventListener('click',e=>{if(e.target.closest?.('.btn'))setTimeout(check,30)},true);
  setTimeout(check,80);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',build);else build();
})();