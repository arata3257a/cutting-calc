function selectTieQuestions(scores,ranked){
  const bank=activeTieBank(),prototypes=activePrototypes(),top=ranked.slice(0,4),target=tieQuestionCount(scores,ranked);
  const counts=Object.fromEntries(activeTraits().map(t=>[t,0])),remaining=[...bank],selected=[];
  while(selected.length<target && remaining.length){
    let bestIdx=0,bestScore=-Infinity;
    remaining.forEach((q,idx)=>{
      const close=1-Math.min(Math.abs(scores[q.a]-scores[q.b])/100,1);
      const diffs=top.map(x=>{
        const p=prototypes[x.profile.code],ai=activeTraits().indexOf(q.a),bi=activeTraits().indexOf(q.b);
        return p[ai]-p[bi];
      });
      const discrimination=(Math.max(...diffs)-Math.min(...diffs))/100;
      const coverage=(counts[q.a]===0?0.35:counts[q.a]<2?0.12:0)+(counts[q.b]===0?0.35:counts[q.b]<2?0.12:0);
      const score=discrimination*1.5+close*.8+coverage;
      if(score>bestScore){bestScore=score;bestIdx=idx}
    });
    const q=remaining.splice(bestIdx,1)[0]; selected.push(q); counts[q.a]++; counts[q.b]++;
  }
  return selected;
}
function startTieBreak(scores,ranked){
  baseScores={...scores}; tieQuestions=selectTieQuestions(scores,ranked); tieIndex=0; usedTieBreak=true;
  tieVector=Object.fromEntries(activeTraits().map(t=>[t,0]));
  show('tiebreak'); renderTieQuestion();
}
function renderTieQuestion(){
  const q=tieQuestions[tieIndex],total=tieQuestions.length,p=Math.round((tieIndex+1)/total*100);
  $('tieCount').textContent=`追加 ${tieIndex+1} / ${total}`; $('tiePercent').textContent=p+'%'; $('tieProgress').style.width=p+'%';
  $('tieQuestion').textContent=q.q; $('tieAText').textContent=q.at; $('tieBText').textContent=q.bt;
}
function answerTie(side){
  const q=tieQuestions[tieIndex];
  if(side==='A'){tieVector[q.a]+=1;tieVector[q.b]-=1}else{tieVector[q.a]-=1;tieVector[q.b]+=1}
  if(tieIndex<tieQuestions.length-1){tieIndex++;renderTieQuestion()}
  else{show('loading');setTimeout(()=>renderFinalAfterTie(),500)}
}
function adjustedTieScores(){
  const out={...baseScores};
  activeTraits().forEach(t=>out[t]=Math.max(0,Math.min(100,Math.round(out[t]+tieVector[t]*7))));
  return out;
}
function renderFinalAfterTie(){
  try{
    const scores=adjustedTieScores(),ranked=rankTypes(scores);
    renderResultWith(scores,ranked,true); show('result');
  }catch(err){
    console.error(err);
    show('result');
    const copy=$('resultCopy'); if(copy) copy.textContent='結果表示でエラーが発生しました。もう一度診断してください。';
  }
}
function naturalList(items){
  const names=items.map(x=>typeof x==="string"?x:x.trait);
  if(names.length===0)return "";
  if(names.length===1)return names[0];
  if(names.length===2)return `${names[0]}・${names[1]}`;
  return `${names.slice(0,-1).join("・")}・${names[names.length-1]}`;
}

function scoreSummary(scores){
  const entries=activeTraits().map(t=>({trait:t,score:scores[t]})).sort((a,b)=>b.score-a.score);
  const max=entries[0].score,min=entries[entries.length-1].score,spread=max-min;
  const highs=entries.filter(x=>x.score>=max-4);
  const lows=entries.filter(x=>x.score<=min+4);
  let shape="mixed";
  if(spread<=8)shape="flat";
  else if(highs.length>=3 && max>=70)shape="broad-high";
  else if(highs.length===2 && max>=70)shape="dual-peak";
  else if(highs.length===1 && max>=75)shape="single-peak";
  return {entries,max,min,spread,highs,lows,shape};
}

function typeDifference(best,second,scores){
  if(!second)return "";
  const traits=activeTraits(),prototypes=activePrototypes();
  const b=prototypes[best.code],s=prototypes[second.code];
  const candidates=traits.map((t,i)=>({trait:t,diff:Math.abs(b[i]-s[i]),best:b[i],second:s[i]}))
    .sort((a,b)=>b.diff-a.diff);
  const top=candidates[0];
  if(!top || top.diff<8)return "";
  return top.best>top.second
    ? `2位の「${second.name}」と比べると、${top.trait}をより強く使う組み合わせです。`
    : `2位の「${second.name}」と比べると、${top.trait}だけに偏らず他の項目も使う組み合わせです。`;
}

function reasonFor(scores,ranked){
  const s=scoreSummary(scores),best=ranked[0].profile,second=ranked[1]?.profile;
  const highNames=naturalList(s.highs),lowNames=naturalList(s.lows);
  let core="";

  if(s.shape==="flat"){
    core=`5項目が${s.min}〜${s.max}の範囲に収まり、大きな偏りはありません。`;
  }else if(s.shape==="broad-high"){
    core=`${highNames}が${s.highs.map(x=>x.score).join("・")}と高い水準でそろっています。`;
  }else if(s.shape==="dual-peak"){
    core=`${highNames}がともに高く、今回の回答ではこの2項目が中心的な強みです。`;
  }else if(s.shape==="single-peak"){
    core=`${s.highs[0].trait}が${s.highs[0].score}で最も高く、特に強い傾向として出ています。`;
  }else{
    core=`上位は${highNames}、下位は${lowNames}で、5項目に差が出ています。`;
  }

  let low="";
  if(s.spread>=10 && s.lows.length===1){
    low=`一方、${s.lows[0].trait}は${s.lows[0].score}で、他の項目より控えめでした。`;
  }else if(s.spread>=10 && s.lows.length>1){
    low=`一方、${lowNames}は相対的に控えめでした。`;
  }

  let fit="";
  if(best.code==="D3"){
    const highCount=s.entries.filter(x=>x.score>=70).length;
    fit=highCount>=3
      ? `複数の能力を高い水準で使えているため、「${best.name}」の基準に最も近い結果です。`
      : `突出した1項目より全体のまとまりが強いため、「${best.name}」の基準に最も近い結果です。`;
  }else{
    fit=`この5項目の組み合わせが、16タイプの中で「${best.name}」の基準パターンに最も近い結果です。`;
  }

  return [core,low,fit,typeDifference(best,second,scores)].filter(Boolean).join(" ");
}

function scoreInterpretation(scores){
  const s=scoreSummary(scores);
  const high=s.entries.filter(x=>x.score>=75);
  const mid=s.entries.filter(x=>x.score>=55 && x.score<75);
  const low=s.entries.filter(x=>x.score<55);
  const parts=[];
  if(high.length)parts.push(`75以上：${naturalList(high)}＝強く出ている傾向`);
  if(mid.length)parts.push(`55〜74：${naturalList(mid)}＝状況に応じて使いやすい傾向`);
  if(low.length)parts.push(`54以下：${naturalList(low)}＝今回の回答では控えめ`);
  return parts.join("。")+"。";
}

function clarityLabel(ranked,fromTie){
  if(fromTie)return "追加質問で確認済み";
  const d1=ranked[0]?.distance??1,d2=ranked[1]?.distance??1;
  const gap=(d2-d1)/Math.max(d1,0.03);
  if(gap>=0.20)return "明瞭";
  if(gap>=0.06)return "やや明瞭";
  return "近い候補あり";
}
