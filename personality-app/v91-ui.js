function drawRadar(scores){const traits=activeTraits(),c=$('radar'),x=c.getContext('2d'),w=c.width,h=c.height,cx=w/2,cy=h/2+5,R=108,aa=traits.map((_,j)=>-Math.PI/2+j*2*Math.PI/5),pt=(a,r)=>[cx+Math.cos(a)*r,cy+Math.sin(a)*r];x.clearRect(0,0,w,h);for(let k=1;k<=5;k++){x.beginPath();aa.forEach((a,j)=>{let[q,r]=pt(a,R*k/5);j?x.lineTo(q,r):x.moveTo(q,r)});x.closePath();x.strokeStyle='#ffffff22';x.stroke()}aa.forEach(a=>{let[q,r]=pt(a,R);x.beginPath();x.moveTo(cx,cy);x.lineTo(q,r);x.strokeStyle='#ffffff18';x.stroke()});x.beginPath();traits.forEach((t,j)=>{let[q,r]=pt(aa[j],R*scores[t]/100);j?x.lineTo(q,r):x.moveTo(q,r)});x.closePath();x.fillStyle='#6366f166';x.fill();x.strokeStyle='#67e8f9';x.lineWidth=3;x.stroke();x.font='700 13px sans-serif';x.fillStyle='#e5eefc';x.textAlign='center';traits.forEach((t,j)=>{let[q,r]=pt(aa[j],R+36);x.fillText(t,q,r+5)})}
function renderScores(scores){const traits=activeTraits();$('scores').innerHTML=traits.map(t=>`<div class="score-row"><b>${t}</b><div class="bar"><div class="fill" style="width:${scores[t]}%"></div></div><div class="score-num">${scores[t]}</div></div>`).join('')}
function renderResultWith(scores,ranked,fromTie=false){
  const p=ranked[0].profile,art=$('art');
  art.innerHTML="";
  art.style.background="";
  art.style.backgroundImage=`url(${SHEETS[p.code[0]]})`;
  art.style.backgroundPosition=SHEET_POS[p.code[1]];
  art.dataset.type=p.code;

  $('typeName').textContent=p.name;
  $('typeCode').textContent=`TYPE ${p.code} ・ ${mode==='maker'?'ものづくり診断':'総合診断'}`;
  $('resultCopy').textContent=p.copy;
  $('strengths').innerHTML=p.strengths.map(x=>`<li>${x}</li>`).join('');
  $('cares').innerHTML=p.cares.map(x=>`<li>${x}</li>`).join('');
  $('fit').textContent=p.fit;
  $('oneLine').textContent=p.one;
  $('reasonText').textContent=fromTie
    ? `最初の25問では候補が近かったため、追加${tieQuestions.length}問で優先傾向を確認しました。 `+reasonFor(scores,ranked)
    : reasonFor(scores,ranked);
  $('clarityText').textContent=clarityLabel(ranked,fromTie);
  $('scoreInterpretation').textContent=scoreInterpretation(scores);
  $('alternatives').innerHTML=ranked.slice(1,3)
    .map((x,j)=>`<span class="alt-chip">${j+2}位 TYPE ${x.profile.code} ${x.profile.name}</span>`).join('');
  renderScores(scores);
  requestAnimationFrame(()=>drawRadar(scores));
  window.latest={scores,p,traits:activeTraits()};
}
function renderResult(){
  try{
    const scores=calculate(),ranked=rankTypes(scores);
    if(needsTieBreak(scores,ranked)){startTieBreak(scores,ranked);return}
    usedTieBreak=false; renderResultWith(scores,ranked,false); show('result');
  }catch(err){
    console.error(err);
    show('result');
    const copy=$('resultCopy'); if(copy) copy.textContent='結果表示でエラーが発生しました。もう一度診断してください。';
  }
}
$('tieA').addEventListener('click',()=>answerTie('A'));$('tieB').addEventListener('click',()=>answerTie('B'));
$('startBtn').addEventListener('click',()=>{questions=mode==='maker'?MAKER_QUESTIONS:GENERAL_QUESTIONS;i=0;answers=Array(questions.length).fill(null);baseScores=null;tieQuestions=[];tieIndex=0;tieVector={};usedTieBreak=false;show('quiz');renderQuestion()});
document.querySelectorAll('.answer').forEach(btn=>btn.addEventListener('click',()=>{answers[i]=Number(btn.dataset.v);if(i<questions.length-1){i++;renderQuestion()}else{show('loading');setTimeout(()=>{renderResult()},650)}}));
$('backBtn').addEventListener('click',()=>{if(i>0){i--;renderQuestion()}});$('retryBtn').addEventListener('click',()=>show('home'));
$('shareBtn').addEventListener('click',async()=>{const r=window.latest;if(!r||!r.p){alert('診断結果を表示してから共有してください');return}const text=`性格分析結果：${r.p.name}\n${r.p.one}\n`+r.traits.map(t=>`${t}${r.scores[t]}`).join(' / ');if(navigator.share){try{await navigator.share({title:'性格分析結果',text})}catch(e){}}else{try{await navigator.clipboard.writeText(text);alert('結果をコピーしました')}catch(e){alert(text)}}});
window.__diagnostic={calculateFrom:(m,ans)=>{mode=m;questions=m==='maker'?MAKER_QUESTIONS:GENERAL_QUESTIONS;answers=ans.slice();return calculate()},rankFrom:(m,s)=>{mode=m;return rankTypes(s).map(x=>x.profile.code)}};
