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
      if(Number(r.d)>0&&Number(r.n)>0)vcs.push(Math.PI*Number(r.d)*Number(r.n)/1000);
      if(z&&Number(r.n)>0){
        ['sideF','slotF','finishF'].forEach(k=>{
          if(Number(r[k])>0)fzs.push(Number(r[k])/(Number(r.n)*z));
        });
      }
    });
  });
  if(!vcs.length&&!fzs.length)return null;
  return {
    vcMin:vcs.length?Math.min(...vcs):0,
    vcMax:vcs.length?Math.max(...vcs):0,
    fzMin:fzs.length?Math.min(...fzs):0,
    fzMax:fzs.length?Math.max(...fzs):0
  };
}

function addRisk(arr,level,title,reason,actions=[]){
  const rank={watch:1,high:2};
  const found=arr.find(x=>x.title===title);
  if(found){
    if(rank[level]>rank[found.level])found.level=level;
    if(reason&&!found.reasons.includes(reason))found.reasons.push(reason);
    actions.forEach(a=>{if(a&&!found.actions.includes(a))found.actions.push(a)});
    return;
  }
  arr.push({level,title,reasons:reason?[reason]:[],actions:[...new Set(actions.filter(Boolean))]});
}

function assess(){
  const D=val('d'),Z=val('z'),Vc=val('vc'),fz=val('fz'),ap=val('ap'),ae=val('ae'),L=val('stick'),maxN=val('maxn');
  const mat=$('mat')?.value||'';
  const op=$('op')?.value||'';
  const cool=$('cool')?.value||'';
  if(!(D>0&&Z>0&&Vc>0&&fz>0&&maxN>0&&ap>=0&&ae>=0&&L>=0))return {invalid:true,risks:[]};

  const ld=L/D, apr=ap/D, aer=ae/D;
  const rawN=1000*Vc/(Math.PI*D);
  const actualN=Math.min(rawN,maxN);
  const actualVc=Math.PI*D*actualN/1000;
  const ref=getRefRange(mat);
  const risks=[];

  if(ld>5){
    addRisk(risks,'high','びびり・振動',`突出し比 L/D=${ld.toFixed(1)} と長く、工具剛性が下がります。`,['可能なら突出し量を短くする','ae・apを小さくして負荷を下げる']);
    addRisk(risks,'high','工具たわみ・寸法ズレ',`突出し比 L/D=${ld.toFixed(1)} のため工具がたわみやすい条件です。`,['仕上げ代を残して仕上げ工程を分ける','保持剛性と工具の振れを確認する']);
    addRisk(risks,'watch','刃欠け・折損','長い突出しでは曲げ負荷が増えます。',['切込みを一段下げてテスト加工する']);
  }else if(ld>3){
    addRisk(risks,'watch','びびり・振動',`突出し比 L/D=${ld.toFixed(1)} とやや長めです。`,['突出し量を短くできないか確認する','びびりが出る場合はaeを下げる']);
    if(aer>0.3||apr>1)addRisk(risks,'watch','工具たわみ・寸法ズレ','突出しが長めの状態で切削負荷も掛かっています。',['保持剛性と工具の振れを確認する']);
  }

  if(ae>D*1.05){
    addRisk(risks,'high','過大な切削負荷',`ae/D=${(aer*100).toFixed(0)}% で横切込みが工具径を超えています。`,['aeの入力値を確認する','工具メーカーの許容条件を確認する']);
  }else if(op==='slot'||aer>=0.9){
    addRisk(risks,ld>4?'high':'watch','切粉詰まり・発熱',`ae/D=${(aer*100).toFixed(0)}% の全幅に近い切削で、切粉の逃げが少なくなります。`,['クーラントまたはエアで切粉排出を確保する','必要ならap・送りを下げて様子を見る']);
    addRisk(risks,'watch','切削負荷の増加','工具の接触割合が大きい条件です。',['工具メーカーの溝加工条件を優先する']);
  }else if(aer>=0.5){
    addRisk(risks,'watch','切削負荷・発熱',`ae/D=${(aer*100).toFixed(0)}% と径方向の接触割合が大きめです。`,['びびりや発熱が出る場合はaeを小さくする']);
  }

  if(apr>3){
    addRisk(risks,'high','工具たわみ・刃欠け',`ap/D=${apr.toFixed(1)}倍 と軸方向切込みが大きい条件です。`,['工具の有効刃長を確認する','apを下げて複数回に分ける']);
  }else if(apr>1.5){
    addRisk(risks,'watch','工具たわみ・びびり',`ap/D=${apr.toFixed(1)}倍 と軸方向の接触長さが大きめです。`,['工具の有効刃長と突出し量を確認する']);
  }

  if(ref){
    if(ref.vcMax&&actualVc>ref.vcMax*1.6){
      addRisk(risks,actualVc>ref.vcMax*2.3?'high':'watch','発熱・工具摩耗',`実切削速度 約${actualVc.toFixed(0)}m/min は、EXTRA登録済み条件レンジよりかなり高めです。`,['Vcを下げて工具摩耗を確認する','使用工具メーカーの推奨Vcを確認する']);
    }
    if(ref.fzMax&&fz>ref.fzMax*1.6){
      addRisk(risks,fz>ref.fzMax*2.3?'high':'watch','刃欠け・工具負荷',`fz=${fz}mm/刃 は、EXTRA登録済み条件レンジよりかなり大きめです。`,['fzを下げて切削音・主軸負荷を確認する','工具メーカー推奨fzを確認する']);
    }
    if(ref.fzMin&&fz<ref.fzMin*0.35){
      addRisk(risks,'watch','擦れ・発熱',`fz=${fz}mm/刃 は、EXTRA登録済み条件レンジに対してかなり小さめです。`,['送りを下げすぎていないか確認する','工具の振れと実切込みを確認する']);
    }
  }

  const cuttingOil=['水溶性','油性'].includes(cool);
  if(mat==='sus'&&!cuttingOil){
    addRisk(risks,'high','発熱・加工硬化','ステンレスを切削油なしで加工する設定です。',['水溶性または油性切削油を使用する','工具メーカーの給油条件を確認する']);
    addRisk(risks,'watch','工具摩耗','発熱が続くと刃先摩耗が進みやすくなります。',['切削熱と刃先状態を早めに確認する']);
  }
  if(['titanium','inconel'].includes(mat)&&!cuttingOil){
    addRisk(risks,'high','発熱・工具摩耗','難削材でクーラントがエアブロー／ドライ設定です。',['使用工具メーカーの給油条件を優先する','切削熱と工具摩耗をこまめに確認する']);
  }

  if(rawN>maxN*1.5){
    addRisk(risks,'watch','メーカー想定との条件差',`計算回転数 約${Math.round(rawN).toLocaleString()}rpm に対して機械上限は ${Math.round(maxN).toLocaleString()}rpm です。`,['実回転数に合わせた送りFになっていることを確認する']);
  }

  if(ld>3&&aer>=0.5){
    addRisk(risks,ld>5?'high':'watch','びびり・工具たわみ','長めの突出しと大きめの横切込みが重なっています。',['まずaeを下げる','突出し量を短くする']);
  }
  if(isNaN(actualVc)||!isFinite(actualVc))return {invalid:true,risks:[]};
  return {invalid:false,risks,ld,apr,aer,actualVc};
}

function render(){
  const box=$('conditionWarningBox');
  if(!box)return;
  const result=assess();
  if(result.invalid){
    box.className='cw-box cw-yellow';
    box.innerHTML='<div class="cw-title">△ 想定される懸念</div><div class="cw-line">条件を入力すると、起こりやすい現象を表示します。</div>';
    return;
  }
  const risks=result.risks;
  if(!risks.length){
    box.className='cw-box cw-green';
    box.innerHTML='<div class="cw-title">✓ 想定される懸念</div><div class="cw-line"><b>入力条件からは大きな懸念を検出していません。</b></div><div class="cw-note">※機械剛性・工具形状・保持・振れ・ワーク状態など、未入力要素は判定できません。</div>';
    return;
  }
  const hasHigh=risks.some(x=>x.level==='high');
  box.className='cw-box '+(hasHigh?'cw-red':'cw-yellow');
  const items=risks.map(r=>{
    const tag=r.level==='high'?'<span class="cw-tag cw-tag-high">懸念 高</span>':'<span class="cw-tag cw-tag-watch">注意</span>';
    const reasons=r.reasons.map(x=>`<div class="cw-reason">${x}</div>`).join('');
    const actions=r.actions.length?`<div class="cw-actions"><b>対策候補：</b>${r.actions.join(' / ')}</div>`:'';
    return `<div class="cw-item">${tag}<b class="cw-risk-title">${r.title}</b>${reasons}${actions}</div>`;
  }).join('');
  box.innerHTML=`<div class="cw-title">⚠ 想定される懸念</div><div class="cw-lead">この条件で起こりやすい現象の候補です。</div>${items}<div class="cw-note">※発生を断定するものではありません。メーカー推奨条件、機械剛性、工具保持、実加工音・切粉・工具摩耗を優先して判断してください。</div>`;
}

function build(){
  if($('conditionWarningBox')){render();return;}
  const style=document.createElement('style');
  style.textContent='.cw-box{margin:12px 0 0;padding:12px;border-radius:11px;border:1px solid;font-size:12px;line-height:1.55}.cw-title{font-size:15px;font-weight:900;margin-bottom:4px}.cw-lead{font-size:11px;opacity:.9;margin-bottom:8px}.cw-item{background:rgba(0,0,0,.16);border-radius:9px;padding:9px;margin-top:7px}.cw-tag{display:inline-block;border-radius:99px;padding:2px 7px;margin-right:6px;font-size:10px;font-weight:900}.cw-tag-high{background:#a93646;color:#fff}.cw-tag-watch{background:#8b7118;color:#fff3b0}.cw-risk-title{font-size:13px}.cw-reason{margin-top:4px}.cw-actions{margin-top:5px;font-size:11px;color:#f5f5f5}.cw-note{margin-top:9px;font-size:10px;opacity:.82}.cw-green{background:#263b31;border-color:#5da874;color:#c9f3d5}.cw-yellow{background:#433d25;border-color:#d4af37;color:#ffe394}.cw-red{background:#472f34;border-color:#e06a78;color:#ffd1d6}';
  document.head.appendChild(style);
  const cards=[...document.querySelectorAll('main>.card')];
  const resultCard=cards.find(c=>(c.querySelector('.sec')?.textContent||'').trim()==='使用条件');
  if(!resultCard)return;
  const box=document.createElement('div');
  box.id='conditionWarningBox';
  box.className='cw-box cw-green';
  const msg=$('msg');
  if(msg)msg.insertAdjacentElement('afterend',box);else resultCard.appendChild(box);

  ['d','z','vc','fz','ap','ae','stick','maxn','mat','op','mode','cool','series','presetD','hgsMat','ballMat'].forEach(id=>{
    const e=$(id);
    if(e){
      e.addEventListener('input',()=>setTimeout(render,0));
      e.addEventListener('change',()=>setTimeout(render,0));
    }
  });
  document.addEventListener('click',e=>{if(e.target.closest?.('.btn'))setTimeout(render,40)},true);
  setTimeout(render,80);
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',build);else build();
})();