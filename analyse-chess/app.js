import{Chess}from'./lib/chess.js';
const $=s=>document.querySelector(s),LS=localStorage;
const GL={p:'♟',n:'♞',b:'♝',r:'♜',q:'♛',k:'♚'},VAL={p:1,n:3,b:3,r:5,q:9,k:0};
const NOM={p:'pion',n:'cavalier',b:'fou',r:'tour',q:'dame',k:'roi'};
const CL={meilleur:['Meilleur coup','★'],excellent:['Excellent','!'],bon:['Bon coup',''],imprecision:['Imprécision','?!'],erreur:['Erreur','?'],gaffe:['Gaffe','??']};
const DRAW=['agreed','repetition','stalemate','insufficient','50move','timevsinsufficient'];
const out=r=>r==='win'?'V':DRAW.includes(r)?'N':'D';
let games=[],eng=null,busy=false,cur=null,k=0,user='';
const wp=cp=>50+50*(2/(1+Math.exp(-.00368208*Math.max(-1000,Math.min(1000,cp))))-1);
const avg=a=>a.length?a.reduce((s,x)=>s+x,0)/a.length:0;
const say=t=>$('#st').textContent=t;

function engine(){
 if(eng)return eng;
 const w=new Worker('engine/stockfish-18-lite-single.js');let q=null;
 w.onerror=()=>say("Moteur introuvable : ouvre le site depuis un hébergement web (voir le guide), pas en double-cliquant sur index.html.");
 w.onmessage=e=>q&&q(String(e.data));
 const ready=new Promise(r=>{q=l=>{if(l==='readyok'){q=null;r()}}});
 w.postMessage('uci');w.postMessage('setoption name Threads value 1');w.postMessage('isready');
 eng={async go(fen,depth){
  await ready;
  return new Promise(res=>{let cp=0,mate=null;
   q=l=>{
    if(l.startsWith('info')&&/ score /.test(l)&&!/bound/.test(l)){const m=l.match(/score (cp|mate) (-?\d+)/);if(m){mate=m[1]==='mate'?+m[2]:null;cp=mate!=null?(mate>0?10000-mate:-10000-mate):+m[2]}}
    else if(l.startsWith('bestmove')){q=null;res({cp,mate,best:l.split(' ')[1]})}};
   w.postMessage('position fen '+fen);w.postMessage('go depth '+depth)})}};
 return eng}

function prep(g){const c=new Chess();c.loadPgn(g.pgn);const hist=c.history({verbose:true});const r=new Chess(),fens=[r.fen()];hist.forEach(m=>{r.move(m.san);fens.push(r.fen())});return{hist,fens}}

async function analyse(g,depth){
 const{fens}=prep(g),ev=[],e=engine();$('#pg').hidden=false;
 for(let i=0;i<fens.length;i++){
  const c=new Chess(fens[i]);
  if(c.isCheckmate())ev.push({cp:-10000,mate:0,best:null});
  else if(c.isGameOver())ev.push({cp:0,mate:null,best:null});
  else ev.push(await e.go(fens[i],depth));
  $('#pg').value=(i+1)/fens.length}
 $('#pg').hidden=true;return ev}

function derive(g,ev,color){
 const{hist,fens}=prep(g);
 const clk=[...g.pgn.matchAll(/\[%clk ([\d:.]+)\]/g)].map(m=>m[1].split(':').reduce((a,x)=>a*60+ +x,0));
 const W=ev.map((e,i)=>wp(fens[i].split(' ')[1]==='w'?e.cp:-e.cp));
 const base=parseInt(g.time_control)||0;
 const moves=hist.map((m,i)=>{
  const w=m.color==='w',b=w?W[i]:100-W[i],a=w?W[i+1]:100-W[i+1],loss=Math.max(0,b-a);
  const cls=ev[i].best===m.lan||loss<.5?'meilleur':loss<2?'excellent':loss<5?'bon':loss<10?'imprecision':loss<20?'erreur':'gaffe';
  return{m,i,color:m.color,before:b,after:a,loss,cls,acc:Math.max(0,Math.min(100,103.1668*Math.exp(-.04354*loss)-3.1669)),clk:clk[i]}});
 const slug=(g.pgn.match(/ECOUrl "[^"]*\/openings\/([^"?]+)/)||[])[1]||'';
 return{g,ev,fens,W,moves,color,base,res:out(g[color==='w'?'white':'black'].result),open:slug.replace(/-\d+\..*$/,'').replace(/-/g,' ')}}

const san=(fen,u)=>{try{return new Chess(fen).move({from:u.slice(0,2),to:u.slice(2,4),promotion:u[4]})}catch{return null}};
const fmt=(e,fen)=>{const s=fen.split(' ')[1]==='w'?1:-1;if(e.mate!=null)return`mat en ${Math.abs(e.mate)} pour les ${e.mate*s>0?'Blancs':'Noirs'}`;const v=s*e.cp/100;return(v>0?'+':'')+v.toFixed(1)};
const lowT=(d,x)=>x.clk!=null&&x.clk<Math.max(10,d.base*.05);

function explain(d,i){
 const x=d.moves[i],m=x.m,e0=d.ev[i],e1=d.ev[i+1],bm=e0.best&&san(d.fens[i],e0.best),bs=bm?bm.san:'?';
 if(x.cls==='meilleur')return'Meilleur coup de la position.';
 if(x.cls==='excellent')return`Presque aussi bon que le meilleur coup (${bs}).`;
 if(x.cls==='bon')return`Coup correct. Le moteur préférait ${bs}.`;
 const t=[],rep=e1.best&&san(d.fens[i+1],e1.best);
 if(e0.mate>0)t.push(`Mat en ${e0.mate} manqué avec ${bs}.`);
 if(e1.mate>0)t.push(`Ce coup permet un mat en ${e1.mate}.`);
 if(x.loss>=10&&rep&&rep.captured)t.push(`Pièce en prise : le ${NOM[rep.captured]} en ${rep.to} peut être pris (${rep.san}).`);
 if(x.loss>=10&&bm&&bm.captured&&VAL[bm.captured]>=3&&bm.lan!==m.lan)t.push(`Gain manqué : un ${NOM[bm.captured]} pouvait être gagné avec ${bs}.`);
 if(x.before>=70&&x.after<55)t.push(`Avantage net (${Math.round(x.before)} % de chances de gain) gâché par ce coup.`);
 if(i<20&&x.loss>=10)t.push("Erreur d'ouverture.");
 if(lowT(d,x)&&x.loss>=10)t.push(`Joué avec ${Math.round(x.clk)} s restantes : manque de temps probable.`);
 if(!t.length)t.push(`Ce coup coûte ${Math.round(x.loss)} points de chances de gain.`);
 t.push(`Meilleur coup : ${bs} (évaluation ${fmt(e0,d.fens[i])}).`);
 return t.join(' ')}

function summary(d){
 const mine=d.moves.filter(x=>x.color===d.color);if(!mine.length)return'';
 const cnt=c=>mine.filter(x=>x.cls===c).length,R=[];
 if(d.res==='D'){
  if(d.g[d.color==='w'?'white':'black'].result==='timeout')R.push('Défaite au temps.');
  const w=mine.reduce((a,x)=>x.loss>a.loss?x:a,mine[0]);
  R.push(`Moment décisif : coup ${Math.ceil((w.i+1)/2)} (${w.m.san}), −${Math.round(w.loss)} % de chances de gain.`);
  if(cnt('gaffe'))R.push(`${cnt('gaffe')} gaffe(s) au total.`);
  const pk=Math.max(...mine.map(x=>x.before));if(pk>=70)R.push(`Tu as eu un net avantage (jusqu'à ${Math.round(pk)} %) sans le convertir.`);
  if(mine.some(x=>x.i<20&&x.loss>=10))R.push("Des erreurs dès l'ouverture.");
  const tt=mine.filter(x=>lowT(d,x)&&x.loss>=10).length;if(tt)R.push(`${tt} erreur(s) jouée(s) en manque de temps.`);
  if(!cnt('gaffe')&&R.length<3)R.push("Pas de grosse gaffe : défaite par accumulation d'imprécisions.")}
 const chips=Object.keys(CL).map(c=>`<span class="${c}">${cnt(c)} ${CL[c][0].toLowerCase()}</span>`).join('');
 return`<h2>Précision : ${Math.round(avg(mine.map(x=>x.acc)))} %</h2><div class="chips">${chips}</div>${R.length?`<b>Pourquoi cette défaite ?</b><ul>${R.map(r=>`<li>${r}</li>`).join('')}</ul>`:''}`}

function arrow(u,flip){const p=s=>{const f='abcdefgh'.indexOf(s[0]),r=8-s[1];return[(flip?7-f:f)+.5,(flip?7-r:r)+.5]};
 const[a,b]=p(u.slice(0,2)),[c,e]=p(u.slice(2,4));
 return`<svg viewBox="0 0 8 8"><defs><marker id="ah" markerWidth="3" markerHeight="3" refX="1.5" refY="1.5" orient="auto"><path d="M0 0L3 1.5 0 3z" fill="#2e8b57"/></marker></defs><line x1="${a}" y1="${b}" x2="${c}" y2="${e}" stroke="#2e8b57" stroke-width=".18" stroke-opacity=".85" marker-end="url(#ah)"/></svg>`}

function graph(){const d=cur,n=d.W.length-1,X=i=>i/n*200,Y=v=>60-v*.6;
 const dots=d.moves.filter(x=>x.color===d.color&&x.loss>=10).map(x=>`<circle cx="${X(x.i+1)}" cy="${Y(d.W[x.i+1])}" r="2.2" fill="var(--c-${x.cls})"/>`).join('');
 $('#gr').innerHTML=`<rect width="200" height="60" fill="var(--card)"/><line x1="0" x2="200" y1="30" y2="30" stroke="var(--line)"/><polyline points="${d.W.map((v,i)=>X(i)+','+Y(v)).join(' ')}" fill="none" stroke="var(--a)" stroke-width="1.2"/>${dots}<line x1="${X(k)}" x2="${X(k)}" y1="0" y2="60" stroke="var(--c-excellent)"/>`}

function render(){
 const d=cur;if(!d)return;
 const bd=new Chess(d.fens[k]).board(),flip=d.color==='b',last=k?d.moves[k-1]:null;let h='';
 for(let r=0;r<8;r++)for(let f=0;f<8;f++){
  const rr=flip?7-r:r,ff=flip?7-f:f,s=bd[rr][ff],sq='abcdefgh'[ff]+(8-rr);
  const hl=last&&(sq===last.m.from||sq===last.m.to)?` style="--h:var(--c-${last.cls})"`:'';
  h+=`<div class="sq ${(rr+ff)%2?'d':'l'}"${hl}>${s?`<span class="${s.color}">${GL[s.type]}\uFE0E</span>`:''}${f===0?`<i class="r">${8-rr}</i>`:''}${r===7?`<i class="f">${'abcdefgh'[ff]}</i>`:''}</div>`}
 if(last&&last.loss>=10&&d.ev[k-1].best)h+=arrow(d.ev[k-1].best,flip);
 $('#bd').innerHTML=h;$('#eb').style.setProperty('--w',d.W[k]+'%');$('#ev').textContent=fmt(d.ev[k],d.fens[k]);
 document.querySelectorAll('.mv').forEach(b=>b.classList.toggle('on',+b.dataset.k===k));$('.mv.on')?.scrollIntoView({block:'nearest'});
 $('#ex').innerHTML=last?`<h3>Coup ${Math.ceil(k/2)}${last.color==='w'?'':'…'} : ${last.m.san} — <span class="${last.cls}" style="color:var(--c)">${CL[last.cls][0]}</span></h3><p>${explain(d,k-1)}</p>`:'<p>Position de départ. Avance avec ▶ ou les flèches du clavier.</p>';
 graph()}

function build(){
 const d=cur,g=d.g,me=d.color==='w'?g.white:g.black,op=d.color==='w'?g.black:g.white;
 $('#info').innerHTML=`<h2>Toi (${me.rating}) contre ${op.username} (${op.rating})</h2><small>${{V:'Victoire',N:'Nulle',D:'Défaite'}[d.res]} · ${d.open||'ouverture inconnue'} · <a href="${g.url}" target="_blank" rel="noopener">voir sur Chess.com</a></small>`;
 $('#sm').innerHTML=summary(d);
 $('#ml').innerHTML=d.moves.map((x,i)=>(i%2?'':`<b>${i/2+1}.</b>`)+`<button class="mv ${x.cls}" data-k="${i+1}">${x.m.san}<small>${CL[x.cls][1]}</small></button>`).join('');
 render()}

function list(){$('#gl').innerHTML=games.map((g,i)=>{const w=g.white.username.toLowerCase()===user,me=w?g.white:g.black,op=w?g.black:g.white,r=out(me.result);
 return`<button class="gm" data-i="${i}"><b class="r${r}">${r}</b><span>${op.username} (${op.rating})</span><small>${new Date(g.end_time*1000).toLocaleDateString('fr-FR')} · ${g.time_class}${LS['a:'+g.url]?' · analysée':''}</small></button>`}).join('')||'<small>Aucune partie.</small>'}

async function load(){
 if(busy)return;busy=true;user=$('#u').value.trim().toLowerCase();say('Récupération des parties…');games=[];
 try{
  const r=await fetch(`https://api.chess.com/pub/player/${user}/games/archives`);
  if(!r.ok)throw new Error('pseudo introuvable sur Chess.com');
  const arc=(await r.json()).archives.reverse().slice(0,6),tc=$('#tc').value;
  for(const u of arc){const d=await(await fetch(u)).json();
   games.push(...d.games.filter(g=>g.rules==='chess'&&g.pgn&&(!tc||g.time_class===tc)).reverse());if(games.length>=20)break}
  games=games.slice(0,20);say(games.length?'':'Aucune partie trouvée.')
 }catch(e){say('Erreur : '+e.message)}
 busy=false;list()}

async function openGame(i){
 if(busy)return;busy=true;const g=games[i],color=g.white.username.toLowerCase()===user?'w':'b';
 try{
  let ev=null;try{ev=JSON.parse(LS['a:'+g.url]||'null')}catch{}
  if(!ev){say('Analyse en cours… (quelques dizaines de secondes)');ev=await analyse(g,+$('#dp').value);try{LS['a:'+g.url]=JSON.stringify(ev)}catch{}}
  cur=derive(g,ev,color);k=0;build();say('')
 }catch(e){say('Erreur : '+e.message)}
 busy=false;list()}

$('#go').onclick=load;
$('#gl').onclick=e=>{const b=e.target.closest('.gm');b&&openGame(+b.dataset.i)};
$('#ml').onclick=e=>{const b=e.target.closest('.mv');if(b){k=+b.dataset.k;render()}};
$('#gr').onclick=e=>{if(!cur)return;const r=e.currentTarget.getBoundingClientRect();k=Math.max(0,Math.min(cur.W.length-1,Math.round((e.clientX-r.left)/r.width*(cur.W.length-1))));render()};
const go=n=>{if(cur){k=Math.max(0,Math.min(cur.W.length-1,n));render()}};
$('#b0').onclick=()=>go(0);$('#b1').onclick=()=>go(k-1);$('#b2').onclick=()=>go(k+1);$('#b3').onclick=()=>go(1e9);
document.onkeydown=e=>{if(e.target.tagName==='INPUT'||e.target.tagName==='SELECT')return;if(e.key==='ArrowLeft')go(k-1);if(e.key==='ArrowRight')go(k+1);if(e.key==='Home')go(0);if(e.key==='End')go(1e9)};
