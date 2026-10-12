const GENERAL_TRAITS=CORE.gt,MAKER_TRAITS=CORE.mt,GENERAL_QUESTIONS=CORE.gq,MAKER_QUESTIONS=CORE.mq,GENERAL_PROTOTYPES=CORE.gp,MAKER_PROTOTYPES=CORE.mp;
const SHEETS={A:"assets/A-v92.jpg?v=94",B:"assets/B-v92.jpg?v=94",C:"assets/C-v92.jpg?v=94",D:"assets/D-v92.jpg?v=94"};
const SHEET_POS={"1":"0% 0%","2":"100% 0%","3":"0% 100%","4":"100% 100%"};

const GENERAL_TIE_BANK=[
{a:"行動力",b:"慎重さ",q:"予定外のチャンスが来たとき、より自分に近いのは？",at:"まず動いて、やりながら調整する",bt:"一度リスクを確認してから動く"},
{a:"論理性",b:"創造性",q:"答えが決まっていない課題では、どちらを優先する？",at:"根拠を整理して、筋の通った答えを作る",bt:"新しい切り口を広げて、独自の答えを探す"},
{a:"社交性",b:"論理性",q:"考えがまとまらないとき、どちらが多い？",at:"人と話しながら考えを整理する",bt:"一人で情報を整理して考える"},
{a:"行動力",b:"論理性",q:"トラブルが起きた直後、先にするのは？",at:"まず状況を動かして反応を見る",bt:"原因候補を整理してから手を打つ"},
{a:"社交性",b:"慎重さ",q:"チームで重要な判断をするとき、より近いのは？",at:"早めに意見を出して周囲と詰める",bt:"十分確認してから自分の意見を出す"},
{a:"創造性",b:"慎重さ",q:"実績のある方法と新しい方法なら、どちらを選びやすい？",at:"良くなりそうなら新しい方法を試す",bt:"まず実績のある方法を基準にする"},
{a:"行動力",b:"社交性",q:"新しい企画を始めるなら、どちらが先？",at:"まず自分で小さく始める",bt:"先に仲間を集めて一緒に始める"},
{a:"社交性",b:"創造性",q:"新しいアイデアが欲しいとき、どちらが近い？",at:"人の意見を聞いて広げる",bt:"自分の中で自由に発想を広げる"},
{a:"論理性",b:"慎重さ",q:"重要なミスを防ぐなら、より重視するのは？",at:"原因や条件を論理的に整理する",bt:"手順と確認を丁寧に重ねる"},
{a:"行動力",b:"創造性",q:"思いつきが浮かんだとき、より近いのは？",at:"すぐ試して反応を見る",bt:"別の案も含めて発想を広げる"}
];
const MAKER_TIE_BANK=[
{a:"実行力",b:"設計思考",q:"設備トラブルが起きたとき、先にするなら？",at:"現物を確認して、動かせる範囲から試す",bt:"図面・条件・原因候補を整理してから触る"},
{a:"品質精度",b:"改善発想",q:"今の工程が問題なく動いているとき、より近いのは？",at:"再現性と品質が維持できるかを確認する",bt:"もっと速く・楽にできる方法を考える"},
{a:"協働推進",b:"設計思考",q:"難しい案件を進めるとき、先にするなら？",at:"関係者を集めて条件を共有する",bt:"自分で全体条件を整理して構造を組み立てる"},
{a:"実行力",b:"品質精度",q:"納期が厳しいとき、より自分に近いのは？",at:"安全を押さえて、まず工程を前に進める",bt:"時間が厳しくても重要確認は省かない"},
{a:"改善発想",b:"設計思考",q:"新しい治具を作るなら、どちらから始める？",at:"まず簡単な試作品を作りながら改善する",bt:"構造・干渉・条件を整理してから設計する"},
{a:"協働推進",b:"品質精度",q:"作業のばらつきを減らすなら、どちらを優先する？",at:"チームでコツや注意点を共有する",bt:"測定・基準・手順を明確にする"},
{a:"実行力",b:"改善発想",q:"新しい加工条件を思いついたら？",at:"安全範囲で早めに試して結果を見る",bt:"複数の改善案を考えて比較してから試す"},
{a:"協働推進",b:"改善発想",q:"改善活動でより得意なのは？",at:"周囲を巻き込み、改善を定着させる",bt:"新しい治具や方法そのものを考える"},
{a:"設計思考",b:"品質精度",q:"不具合の再発防止でより重視するのは？",at:"原因構造を整理して仕組みから直す",bt:"測定・確認・標準を強化して再発を防ぐ"},
{a:"実行力",b:"協働推進",q:"現場が止まっているとき、より自然なのは？",at:"自分が先に動いて突破口を作る",bt:"周囲へ声をかけ役割を決めて進める"}
];

let mode="general",questions=GENERAL_QUESTIONS,i=0,answers=[],baseScores=null,tieQuestions=[],tieIndex=0,tieVector={},usedTieBreak=false;
const $=id=>document.getElementById(id);
function activeTraits(){return mode==="maker"?MAKER_TRAITS:GENERAL_TRAITS}
function activeProfiles(){return mode==="maker"?MAKER_PROFILES:GENERAL_PROFILES}
function activePrototypes(){return mode==="maker"?MAKER_PROTOTYPES:GENERAL_PROTOTYPES}

document.querySelectorAll('.mode-card').forEach(btn=>btn.addEventListener('click',()=>{document.querySelectorAll('.mode-card').forEach(x=>x.classList.remove('active'));btn.classList.add('active');mode=btn.dataset.mode}));
function show(id){document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));$(id).classList.add('active');window.scrollTo({top:0,behavior:'smooth'})}
function renderQuestion(){const q=questions[i];$('tag').textContent=q.axis;$('question').textContent=q.text;$('count').textContent=`${i+1} / ${questions.length}`;const p=Math.round((i+1)/questions.length*100);$('percent').textContent=p+'%';$('progress').style.width=p+'%';$('backBtn').disabled=i===0}
function calculate(){
  const traits=activeTraits();
  const groups=Object.fromEntries(traits.map(t=>[t,[]]));
  questions.forEach((q,idx)=>groups[q.axis].push({q,value:answers[idx]}));
  const scores={};

  traits.forEach(t=>{
    const items=groups[t];
    const positive=items.filter(x=>!x.q.reverse);
    const reverse=items.filter(x=>x.q.reverse);
    let weighted=0,maxAbs=0;

    items.forEach(x=>{
      const w=x.q.reverse ? 1/reverse.length : 1/positive.length;
      const centered=x.value-3;
      const signed=x.q.reverse ? -centered : centered;
      weighted += signed*w;
      maxAbs += 2*w;
    });

    scores[t]=Math.round(50 + 50*(weighted/maxAbs));
  });

  return scores;
}
function mean(a){return a.reduce((x,y)=>x+y,0)/a.length}
function normalizePattern(a){const m=mean(a),center=a.map(v=>v-m),sd=Math.sqrt(mean(center.map(v=>v*v)));return {mean:m,sd,norm:sd<0.0001?a.map(()=>0):center.map(v=>v/sd)}}
function rankTypes(scores){
  const traits=activeTraits(),profiles=activeProfiles(),prototypes=activePrototypes();
  const values=traits.map(t=>scores[t]);
  const vp=normalizePattern(values);

  return profiles.map(p=>{
    const pv=prototypes[p.code];
    const pp=normalizePattern(pv);
    const pattern=mean(vp.norm.map((v,j)=>(v-pp.norm[j])**2));
    const absolute=mean(values.map((v,j)=>Math.pow((v-pv[j])/100,2)));
    const distance=pattern*0.55 + absolute*0.45;
    return {profile:p,distance,pattern,absolute};
  }).sort((a,b)=>
    (a.distance-b.distance) ||
    (a.absolute-b.absolute) ||
    (a.pattern-b.pattern) ||
    a.profile.code.localeCompare(b.profile.code)
  );
}
function answerStats(){
  const valid=answers.filter(v=>Number.isFinite(v));
  const counts={1:0,2:0,3:0,4:0,5:0}; valid.forEach(v=>counts[v]++);
  const avg=valid.length?mean(valid):0;
  const sd=valid.length?Math.sqrt(mean(valid.map(v=>(v-avg)**2))):0;
  return {unique:new Set(valid).size,maxSame:Math.max(...Object.values(counts)),sd};
}
function needsTieBreak(scores,ranked){
  const st=answerStats();
  const vals=activeTraits().map(t=>scores[t]);
  const spread=Math.max(...vals)-Math.min(...vals);
  const d1=ranked[0]?.distance??1,d2=ranked[1]?.distance??1;
  const relativeGap=(d2-d1)/Math.max(d1,0.03);

  if(st.unique===1) return true;
  if(st.maxSame>=22) return true;
  if(st.sd<0.28) return true;
  if(spread<=8 && relativeGap<0.06) return true;
  if(relativeGap<0.01) return true;
  return false;
}

function tieQuestionCount(scores,ranked){
  const st=answerStats();
  const vals=activeTraits().map(t=>scores[t]);
  const spread=Math.max(...vals)-Math.min(...vals);
  if(st.unique===1 || st.maxSame>=22 || st.sd<0.28 || spread<=8) return 6;
  return 4;
}
function activeTieBank(){return mode==='maker'?MAKER_TIE_BANK:GENERAL_TIE_BANK}
