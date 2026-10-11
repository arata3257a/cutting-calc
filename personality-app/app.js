let mode="general",questions=generalQuestions,i=0,answers=[];
const $=id=>document.getElementById(id);

document.querySelectorAll('.mode').forEach(b=>b.onclick=()=>{
  document.querySelectorAll('.mode').forEach(x=>x.classList.remove('active'));
  b.classList.add('active');
  mode=b.dataset.mode;
});

function show(id){
  document.querySelectorAll('.screen').forEach(x=>x.classList.remove('active'));
  $(id).classList.add('active');
  window.scrollTo(0,0);
}

function rq(){
  $('tag').textContent=questions[i][0];
  $('question').textContent=questions[i][1];
  $('count').textContent=`${i+1} / ${questions.length}`;
  const p=Math.round((i+1)/questions.length*100);
  $('pct').textContent=p+'%';
  $('bar').style.width=p+'%';
  $('back').disabled=i===0;
}

function calc(){
  const s=Object.fromEntries(traits.map(t=>[t,0]));
  const c=Object.fromEntries(traits.map(t=>[t,0]));
  questions.forEach((q,j)=>{s[q[0]]+=answers[j];c[q[0]]++});
  traits.forEach(t=>s[t]=Math.round(((s[t]/c[t])-1)/4*100));
  return s;
}

function general(s){
  let best=null,d=Infinity;
  for(const p of typeProfiles){
    const target=typePrototypes[p.code];
    let x=0;
    for(const t of traits)x+=(s[t]-target[t])**2;
    if(x<d){d=x;best=p}
  }
  return best;
}

function maker(s){
  const a=Object.entries(s).sort((x,y)=>y[1]-x[1]||traits.indexOf(x[0])-traits.indexOf(y[0]));
  const pair=[a[0][0],a[1][0]].sort().join('|');
  const eq=(x,y)=>pair===[x,y].sort().join('|');
  let code='C1';
  if(eq('行動力','論理性'))code=s['慎重さ']>=50?'C1':'C4';
  else if(eq('論理性','創造性'))code=s['慎重さ']>=60?'C2':'A2';
  else if(eq('行動力','創造性'))code=s['社交性']<55?'B1':'A1';
  else if(eq('行動力','社交性'))code=s['論理性']>=50?'A4':'B2';
  else if(eq('社交性','創造性'))code=s['行動力']>=55?'B2':'D4';
  else if(eq('論理性','慎重さ'))code=s['社交性']<45?'D1':'A3';
  else if(eq('社交性','慎重さ'))code=s['行動力']<55?'B4':'D3';
  else if(eq('慎重さ','創造性'))code=s['論理性']>=50?'D2':'D4';
  else if(eq('行動力','慎重さ'))code=s['創造性']<65?'C3':'A1';
  else if(eq('社交性','論理性'))code=s['慎重さ']>=45?'B3':'A4';
  return typeProfiles.find(p=>p.code===code)||typeProfiles[0];
}

const visual={
 A1:{c:'#ff5b63',c2:'#ff9a62',prop:'🚀',label:'GO!'},
 A2:{c:'#6557d9',c2:'#45b5ff',prop:'💡',label:'IDEA'},
 A3:{c:'#1fa86f',c2:'#63d79f',prop:'🔍',label:'CHECK'},
 A4:{c:'#ff7a22',c2:'#ffc247',prop:'🚩',label:'LEAD'},
 B1:{c:'#ff9d18',c2:'#ffd447',prop:'🛠️',label:'MAKE'},
 B2:{c:'#ee4f9a',c2:'#ff8fbe',prop:'💬',label:'TALK'},
 B3:{c:'#3177db',c2:'#65b8ff',prop:'📊',label:'PLAN'},
 B4:{c:'#4eaa55',c2:'#9bd968',prop:'🛡️',label:'CARE'},
 C1:{c:'#e54e39',c2:'#ff8a45',prop:'🔧',label:'FIELD'},
 C2:{c:'#355bd6',c2:'#61a9ff',prop:'📐',label:'DESIGN'},
 C3:{c:'#208b55',c2:'#5fc878',prop:'🔨',label:'CRAFT'},
 C4:{c:'#7a42d3',c2:'#d768ed',prop:'🧪',label:'TEST'},
 D1:{c:'#2458b8',c2:'#5d99ec',prop:'🔬',label:'FOCUS'},
 D2:{c:'#e27432',c2:'#ffb156',prop:'🗓️',label:'READY'},
 D3:{c:'#44954e',c2:'#84ce68',prop:'⚖️',label:'BALANCE'},
 D4:{c:'#7b43d5',c2:'#cb69ef',prop:'🤖',label:'FLEX'}
};

function esc(s){return String(s).replace(/[&<>\"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[ch]))}

function characterSvg(p){
  const v=visual[p.code]||visual.A2;
  const name=esc(p.name);
  return `
  <svg viewBox="0 0 360 450" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${name}のキャラクター">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${v.c}"/><stop offset="1" stop-color="${v.c2}"/></linearGradient>
      <linearGradient id="hair" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#6f3d2c"/><stop offset=".55" stop-color="#9c6044"/><stop offset="1" stop-color="#553024"/></linearGradient>
      <linearGradient id="cloth" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${v.c}"/><stop offset="1" stop-color="${v.c2}"/></linearGradient>
      <filter id="shadow"><feDropShadow dx="0" dy="8" stdDeviation="10" flood-color="#000" flood-opacity=".22"/></filter>
    </defs>
    <rect width="360" height="450" rx="28" fill="url(#bg)"/>
    <circle cx="46" cy="58" r="34" fill="#fff" opacity=".16"/><circle cx="320" cy="90" r="54" fill="#fff" opacity=".12"/>
    <circle cx="308" cy="328" r="70" fill="#fff" opacity=".08"/>
    <g opacity=".85" fill="#fff"><circle cx="78" cy="120" r="4"/><circle cx="298" cy="178" r="5"/><circle cx="55" cy="330" r="4"/><path d="M305 42l4 9 9 4-9 4-4 9-4-9-9-4 9-4z"/><path d="M50 218l3 7 7 3-7 3-3 7-3-7-7-3 7-3z"/></g>
    <g filter="url(#shadow)">
      <ellipse cx="180" cy="416" rx="104" ry="18" fill="#000" opacity=".15"/>
      <path d="M95 190c-17-76 27-133 86-133 63 0 104 49 86 137l-19 63H114z" fill="url(#hair)"/>
      <path d="M115 161c-4-58 25-98 67-98 45 0 76 38 67 100-8 55-30 79-68 79-40 0-62-28-66-81z" fill="#ffe9de"/>
      <path d="M112 151c7-62 42-96 81-88 34 7 58 38 57 83-20-24-44-38-72-43-18 25-40 40-66 48z" fill="url(#hair)"/>
      <path d="M133 106c19-30 47-45 77-37-14 7-26 20-34 39-13-6-28-7-43-2z" fill="#a96b4f"/>
      <ellipse cx="151" cy="164" rx="10" ry="14" fill="#4e2e24"/><ellipse cx="210" cy="164" rx="10" ry="14" fill="#4e2e24"/>
      <circle cx="155" cy="158" r="3" fill="#fff"/><circle cx="214" cy="158" r="3" fill="#fff"/>
      <ellipse cx="132" cy="188" rx="13" ry="7" fill="#ff8e9a" opacity=".45"/><ellipse cx="229" cy="188" rx="13" ry="7" fill="#ff8e9a" opacity=".45"/>
      <path d="M164 195q17 18 34 0" fill="none" stroke="#bf5861" stroke-width="4" stroke-linecap="round"/>
      <path d="M132 150q18-10 34 0M195 150q18-10 34 0" fill="none" stroke="#61392c" stroke-width="3" stroke-linecap="round"/>
      <path d="M141 241h78l11 29-10 124h-80l-10-124z" fill="#fff9f4"/>
      <path d="M132 257q-28 18-42 69l25 10 36-67z" fill="url(#cloth)"/>
      <path d="M228 257q28 18 42 69l-25 10-36-67z" fill="url(#cloth)"/>
      <path d="M151 245l29 29 29-29 10 18-39 32-39-32z" fill="url(#cloth)"/>
      <circle cx="180" cy="307" r="5" fill="${v.c}"/><circle cx="180" cy="331" r="5" fill="${v.c}"/>
      <path d="M145 390l-18 32h42l11-32zM215 390l18 32h-42l-11-32z" fill="#3b3444"/>
      <ellipse cx="101" cy="334" rx="18" ry="15" fill="#ffe9de"/><ellipse cx="259" cy="334" rx="18" ry="15" fill="#ffe9de"/>
    </g>
    <g transform="translate(246 64)" filter="url(#shadow)"><circle cx="40" cy="40" r="38" fill="#fff" opacity=".96"/><text x="40" y="52" font-size="38" text-anchor="middle">${v.prop}</text></g>
    <g transform="translate(18 18)"><rect width="82" height="30" rx="15" fill="#fff" opacity=".94"/><text x="41" y="20" font-size="12" font-weight="800" text-anchor="middle" fill="${v.c}">TYPE ${p.code}</text></g>
    <g transform="translate(43 360)"><rect width="274" height="64" rx="22" fill="#fff" opacity=".95"/><text x="137" y="25" font-size="13" font-weight="800" text-anchor="middle" fill="${v.c}">${v.label}</text><text x="137" y="49" font-size="20" font-weight="900" text-anchor="middle" fill="#172033">${name}</text></g>
  </svg>`;
}

function radar(s){
  const c=$('radar'),x=c.getContext('2d'),w=c.width,h=c.height,cx=w/2,cy=h/2,R=105;
  const aa=traits.map((_,j)=>-Math.PI/2+j*2*Math.PI/5),pt=(a,r)=>[cx+Math.cos(a)*r,cy+Math.sin(a)*r];
  x.clearRect(0,0,w,h);
  for(let k=1;k<=5;k++){
    x.beginPath();aa.forEach((a,j)=>{const[q,r]=pt(a,R*k/5);j?x.lineTo(q,r):x.moveTo(q,r)});x.closePath();x.strokeStyle='#ffffff22';x.stroke();
  }
  x.beginPath();traits.forEach((t,j)=>{const[q,r]=pt(aa[j],R*s[t]/100);j?x.lineTo(q,r):x.moveTo(q,r)});x.closePath();
  x.fillStyle='#6366f166';x.fill();x.strokeStyle='#67e8f9';x.lineWidth=3;x.stroke();
  x.font='700 13px sans-serif';x.fillStyle='#e5eefc';x.textAlign='center';
  traits.forEach((t,j)=>{const[q,r]=pt(aa[j],R+32);x.fillText(t,q,r+5)});
}

function result(){
  const s=calc(),p=mode==='maker'?maker(s):general(s),art=$('art');
  art.innerHTML=characterSvg(p);
  art.dataset.type=p.code;
  $('type').textContent=p.name;
  $('code').textContent=`TYPE ${p.code} ・ ${mode==='maker'?'ものづくり診断':'総合診断'}`;
  $('copy').textContent=p.copy;
  $('strengths').innerHTML=p.strengths.map(x=>`<li>${x}</li>`).join('');
  $('cares').innerHTML=p.cares.map(x=>`<li>${x}</li>`).join('');
  $('fit').textContent=p.fit;
  $('one').textContent=p.one;
  $('scores').innerHTML=traits.map(t=>`<div class="score"><b>${t}</b><div class="track"><div class="fill" style="width:${s[t]}%"></div></div><b>${s[t]}</b></div>`).join('');
  radar(s);
  window.latest={s,p};
}

$('start').onclick=()=>{questions=mode==='maker'?makerQuestions:generalQuestions;i=0;answers=Array(questions.length).fill(null);show('quiz');rq()};
document.querySelectorAll('.answers button').forEach(b=>b.onclick=()=>{answers[i]=+b.dataset.v;if(i<questions.length-1){i++;rq()}else{show('loading');setTimeout(()=>{result();show('result')},700)}});
$('back').onclick=()=>{if(i>0){i--;rq()}};
$('retry').onclick=()=>show('home');
$('share').onclick=async()=>{const r=window.latest,text=`性格分析結果：${r.p.name}\n${r.p.one}\n`+traits.map(t=>`${t}${r.s[t]}`).join(' / ');if(navigator.share)try{await navigator.share({title:'性格分析結果',text})}catch(e){}else try{await navigator.clipboard.writeText(text);alert('結果をコピーしました')}catch(e){alert(text)}};