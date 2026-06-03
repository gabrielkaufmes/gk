import React, { useState, useMemo } from "react";

/* ================================================================== *
 * WFL — Window Flow Language. Durations are hours (1h=1, 30m=0.5, 1d=24)
 * ================================================================== */
const KW = new Set(["if","then","else","and","or","not","where","const","let","kpi","rule","action","when","true","false"]);
function lex(src){
  const t=[]; let i=0; const n=src.length; const push=(type,value)=>t.push({type,value});
  while(i<n){
    const c=src[i];
    if(c==="#"){ while(i<n && src[i]!=="\n") i++; continue; }
    if(c==="\n"){ push("nl"); i++; continue; }
    if(c===" "||c==="\t"||c==="\r"){ i++; continue; }
    if(c==='"'){ let j=i+1,s=""; while(j<n&&src[j]!=='"'){ s+=src[j]; j++; } i=j+1; push("str",s); continue; }
    if(/[0-9]/.test(c)){ let j=i,num=""; while(j<n&&/[0-9.]/.test(src[j])){ num+=src[j]; j++; }
      let mult=1; if(src[j]==="h"){mult=1;j++;} else if(src[j]==="m"){mult=1/60;j++;} else if(src[j]==="d"){mult=24;j++;}
      i=j; push("num",parseFloat(num)*mult); continue; }
    if(c==="@"){ i++; let j=i,id=""; while(j<n&&/[A-Za-z_]/.test(src[j])){id+=src[j];j++;} i=j; push("agg",id); continue; }
    if(/[A-Za-z_]/.test(c)){ let j=i,id=""; while(j<n&&/[A-Za-z0-9_]/.test(src[j])){id+=src[j];j++;} i=j; push(KW.has(id)?id:"id",id); continue; }
    const two=src.slice(i,i+2);
    if(["==","!=",">=","<=","=>"].includes(two)){ push("op",two); i+=2; continue; }
    if("+-*/%<>(),=".includes(c)){ push("op",c); i++; continue; }
    throw new Error("Unexpected character: "+c);
  }
  push("eof"); return t;
}
function parse(src){
  const t=lex(src); let p=0;
  const peek=()=>t[p], next=()=>t[p++];
  const at=(type,value)=>peek().type===type&&(value===undefined||peek().value===value);
  const eat=(type,value)=>{ if(!at(type,value)) throw new Error(`Expected ${value||type} but got "${peek().value??peek().type}"`); return next(); };
  const skipNl=()=>{ while(at("nl")) next(); };
  function parseExpr(){ if(at("if")) return parseIf(); return parseOr(); }
  function parseIf(){ eat("if"); const c=parseExpr(); eat("then"); const a=parseExpr(); eat("else"); const b=parseExpr(); return {k:"if",c,a,b}; }
  function parseOr(){ let l=parseAnd(); while(at("or")){ next(); l={k:"bin",op:"or",l,r:parseAnd()}; } return l; }
  function parseAnd(){ let l=parseNot(); while(at("and")){ next(); l={k:"bin",op:"and",l,r:parseNot()}; } return l; }
  function parseNot(){ if(at("not")){ next(); return {k:"un",op:"not",e:parseCmp()}; } return parseCmp(); }
  function parseCmp(){ let l=parseAdd(); while(at("op")&&["==","!=","<","<=",">",">="].includes(peek().value)){ const op=next().value; l={k:"bin",op,l,r:parseAdd()}; } return l; }
  function parseAdd(){ let l=parseMul(); while(at("op")&&["+","-"].includes(peek().value)){ const op=next().value; l={k:"bin",op,l,r:parseMul()}; } return l; }
  function parseMul(){ let l=parseUn(); while(at("op")&&["*","/","%"].includes(peek().value)){ const op=next().value; l={k:"bin",op,l,r:parseUn()}; } return l; }
  function parseUn(){ if(at("op","-")){ next(); return {k:"un",op:"neg",e:parseUn()}; } return parsePrimary(); }
  function parsePrimary(){
    if(at("num")) return {k:"num",v:next().value};
    if(at("str")) return {k:"str",v:next().value};
    if(at("true")){ next(); return {k:"num",v:1}; }
    if(at("false")){ next(); return {k:"num",v:0}; }
    if(at("agg")) return parseAgg();
    if(at("op","(")){ next(); const e=parseExpr(); eat("op",")"); return e; }
    if(at("id")){ const name=next().value;
      if(at("op","(")){ next(); const args=[]; if(!at("op",")")){ args.push(parseExpr()); while(at("op",",")){ next(); args.push(parseExpr()); } } eat("op",")"); return {k:"call",name,args}; }
      return {k:"field",name};
    }
    throw new Error("Unexpected token: "+(peek().value??peek().type));
  }
  function parseAgg(){ const fn=next().value; eat("op","("); let measure=null, where=null;
    if(!at("op",")")){ if(!at("where")) measure=parseExpr(); if(at("where")){ next(); where=parseExpr(); } }
    eat("op",")"); return {k:"agg",fn,measure,where};
  }
  const prog={consts:[],lets:[],kpis:[],rules:[]}; skipNl();
  while(!at("eof")){
    if(at("const")){ next(); const name=eat("id").value; eat("op","="); prog.consts.push({name,expr:parseExpr()}); }
    else if(at("let")){ next(); const name=eat("id").value; eat("op","="); prog.lets.push({name,expr:parseExpr()}); }
    else if(at("kpi")){ next(); const label=eat("str").value; eat("op","="); prog.kpis.push({label,expr:parseExpr()}); }
    else if(at("rule")){ next(); const name=eat("str").value; eat("when"); const cond=parseExpr(); eat("op","=>"); eat("action"); eat("op","("); const sev=next().value; eat("op",","); const msg=parseExpr(); eat("op",")"); prog.rules.push({name,cond,sev,msg}); }
    else throw new Error("Unknown statement: "+(peek().value??peek().type));
    if(!at("eof")) eat("nl"); skipNl();
  }
  return prog;
}
const fmtNum=(n)=>{ if(typeof n!=="number"||!isFinite(n)) return String(n); return Number.isInteger(n)?String(n):String(Math.round(n*10)/10); };
const lstr=(v)=> typeof v==="number"? fmtNum(v):String(v);
const truthy=(v)=> typeof v==="number"? v!==0 : !!v;
function evalExpr(node,scope,ctx){
  switch(node.k){
    case "num": return node.v; case "str": return node.v;
    case "field": if(node.name in scope) return scope[node.name]; throw new Error("Unknown field/const: "+node.name);
    case "un": return node.op==="neg"? -evalExpr(node.e,scope,ctx) : (truthy(evalExpr(node.e,scope,ctx))?0:1);
    case "bin": {
      const op=node.op;
      if(op==="and") return truthy(evalExpr(node.l,scope,ctx))&&truthy(evalExpr(node.r,scope,ctx))?1:0;
      if(op==="or") return truthy(evalExpr(node.l,scope,ctx))||truthy(evalExpr(node.r,scope,ctx))?1:0;
      const l=evalExpr(node.l,scope,ctx), r=evalExpr(node.r,scope,ctx);
      switch(op){ case "+": return (typeof l==="string"||typeof r==="string")?(lstr(l)+lstr(r)):l+r;
        case "-": return l-r; case "*": return l*r; case "/": return l/r; case "%": return l%r;
        case "==": return l===r?1:0; case "!=": return l!==r?1:0;
        case "<": return l<r?1:0; case "<=": return l<=r?1:0; case ">": return l>r?1:0; case ">=": return l>=r?1:0; }
      break;
    }
    case "if": return truthy(evalExpr(node.c,scope,ctx))?evalExpr(node.a,scope,ctx):evalExpr(node.b,scope,ctx);
    case "call": { const a=node.args.map(x=>evalExpr(x,scope,ctx));
      const f={max:Math.max,min:Math.min,abs:Math.abs,round:Math.round,floor:Math.floor,ceil:Math.ceil}[node.name];
      if(!f) throw new Error("Unknown function: "+node.name); return f(...a); }
    case "agg": { const rows=ctx.dataset.filter(r=> node.where? truthy(evalExpr(node.where,ctx.rowScope(r),ctx)):true);
      if(node.fn==="count") return rows.length;
      const vals=rows.map(r=>evalExpr(node.measure,ctx.rowScope(r),ctx));
      if(node.fn==="sum") return vals.reduce((a,b)=>a+b,0);
      if(node.fn==="avg") return vals.length?vals.reduce((a,b)=>a+b,0)/vals.length:0;
      if(node.fn==="min") return vals.length?Math.min(...vals):0;
      if(node.fn==="max") return vals.length?Math.max(...vals):0;
      throw new Error("Unknown aggregate: @"+node.fn); }
  }
  throw new Error("eval error");
}
function run(prog,dataset){
  const G={}; for(const c of prog.consts) G[c.name]=evalExpr(c.expr,G,{dataset,rowScope:()=>G});
  const rowScope=(row)=>{ const s={...G,...row}; for(const l of prog.lets) s[l.name]=evalExpr(l.expr,s,{dataset,rowScope}); return s; };
  const ctx={dataset,rowScope};
  const kpis=prog.kpis.map(k=>({label:k.label,value:evalExpr(k.expr,G,ctx)}));
  const SEVR={critical:0,action:1,review:2};
  const ctas=[]; for(const row of dataset){ const s=rowScope(row);
    for(const ru of prog.rules){ if(truthy(evalExpr(ru.cond,s,ctx))) ctas.push({sev:SEVR[ru.sev]??1,id:row.id,msg:lstr(evalExpr(ru.msg,s,ctx))}); } }
  ctas.sort((a,b)=>a.sev-b.sev);
  return {kpis,ctas,computed:dataset.map(rowScope)};
}

/* ---------- Tokens / UI ---------- */
const FONT_DISPLAY="'Archivo', system-ui, sans-serif", FONT_MONO="'Space Mono', ui-monospace, monospace";
const INK="#1c2230",MUTED="#6b7689",LINE="#e3e6ec",PAPER="#f6f5f1",CARD="#fff";
const OK="#22c55e",WARN="#f59e0b",HOT="#ef4444",BLUE="#0ea5e9";
const hexA=(hex,a)=>{const n=parseInt(hex.slice(1),16);return `rgba(${(n>>16)&255},${(n>>8)&255},${n&255},${a})`;};
const SEV={0:{label:"CRITICAL",c:HOT,icon:"▲"},1:{label:"ACTION",c:WARN,icon:"⚑"},2:{label:"REVIEW",c:BLUE,icon:"◆"}};
const TRUCK=80;

const DEFAULT_DATA=[
  {id:"O24-501",customer:"F24",region:"HUB_A",dest:"Lyon",pcs:32,material:"pvc",stage:"ready",stage_index:4,stages_total:5,materials_in:-10,loading_in:6},
  {id:"O24-502",customer:"F24",region:"HUB_A",dest:"Lyon",pcs:28,material:"pvc",stage:"weld",stage_index:2,stages_total:5,materials_in:-5,loading_in:6},
  {id:"O24-503",customer:"ARABESQUE",region:"HUB_A",dest:"Lyon",pcs:24,material:"pvc",stage:"cut",stage_index:1,stages_total:5,materials_in:-2,loading_in:6},
  {id:"O24-530",customer:"LEROY",region:"HUB_B",dest:"Paris",pcs:40,material:"pvc",stage:"glaze",stage_index:3,stages_total:5,materials_in:-3,loading_in:10},
  {id:"O24-531",customer:"HUB_B",region:"HUB_B",dest:"Paris",pcs:22,material:"pvc",stage:"prep",stage_index:0,stages_total:5,materials_in:4,loading_in:10},
  {id:"O24-540",customer:"ARABESQUE",region:"MRS",dest:"Marseille",pcs:18,material:"pvc",stage:"weld",stage_index:2,stages_total:5,materials_in:-8,loading_in:2},
];
const DEFAULT_PROGRAM=`# WFL — inputs are the SQL columns of each order row
const min_stage = 1h
const truck_cap = 80

# derived per-order logic (if/then/else, math, durations)
let remaining = stages_total - stage_index
let mat_ready = max(0, materials_in)
let earliest  = mat_ready + remaining * min_stage
let slack     = loading_in - earliest
let budget    = if remaining > 0 then max(min_stage, (loading_in - mat_ready) / remaining) else 0

# KPIs (aggregate with @)
kpi "Orders"        = @count()
kpi "Avg slack (h)" = @avg(slack)
kpi "At risk"       = @count(where slack < 4)
kpi "PVC pieces"    = @sum(pcs where material == "pvc")

# calls to action — fire per order
rule "late"     when slack < 0                                     => action(critical, id + " late by " + abs(slack) + "h")
rule "blocked"  when materials_in > 0                              => action(critical, "Expedite materials for " + id + " (in " + materials_in + "h)")
rule "expedite" when slack >= 0 and slack < 4 and materials_in <= 0 => action(action, "Push " + id + " — " + budget + "h/stage, " + slack + "h slack")
`;

const SYNTAX=`const NAME = EXPR        # global constant
let NAME = EXPR          # per-order derived field
kpi "Label" = EXPR       # dashboard metric (use @aggregates)
rule "name" when COND => action(SEVERITY, MESSAGE)

durations   1h  30m  1d   (evaluate to hours)
math        + - * / %     compare  == != < <= > >=
logic       and  or  not   choice  if C then A else B
functions   max min abs round floor ceil
aggregates  @count(where C)  @sum(EXPR where C)  @avg  @min  @max
strings     "..."   +  concatenates (numbers auto-format)
severity    critical | action | review

engine reads computed fields: slack, dest, pcs, material
 → truck schedule groups feasible orders (slack>=0) per dest, threshold ${TRUCK}
 → work schedule = earliest-deadline-first by slack`;

export default function WFLPlayground(){
  const [program,setProgram]=useState(DEFAULT_PROGRAM);
  const [dataText,setDataText]=useState(JSON.stringify(DEFAULT_DATA,null,2));
  const [tab,setTab]=useState("kpi");

  const result=useMemo(()=>{
    try{ const data=JSON.parse(dataText); const prog=parse(program); const r=run(prog,data); return {ok:true,...r,data}; }
    catch(e){ return {ok:false,error:String(e.message||e)}; }
  },[program,dataText]);

  const trucks=useMemo(()=>{ if(!result.ok) return [];
    const g={}; result.computed.filter(c=>c.slack>=0).forEach(c=>{ (g[c.dest] ||= {dest:c.dest,pcs:0,orders:[]}); g[c.dest].pcs+=c.pcs; g[c.dest].orders.push(c.id); });
    return Object.values(g).map(t=>({...t,fill:Math.round(t.pcs/TRUCK*100),short:Math.max(0,TRUCK-t.pcs)}));
  },[result]);
  const work=useMemo(()=> result.ok? [...result.computed].sort((a,b)=>a.slack-b.slack):[],[result]);
  const stageDist=useMemo(()=>{ if(!result.ok) return [];
    const order=["prep","cut","weld","glaze","ready","pack"]; const m={};
    result.computed.forEach(c=>{ m[c.stage]=(m[c.stage]||0)+1; });
    return order.filter(s=>m[s]).map(s=>({stage:s,n:m[s]}));
  },[result]);

  const Tab=({id,children})=>(<button onClick={()=>setTab(id)} style={{fontFamily:FONT_MONO,fontSize:12,fontWeight:700,padding:"8px 12px",borderRadius:8,cursor:"pointer",border:"none",background:tab===id?INK:"transparent",color:tab===id?"#fff":MUTED}}>{children}</button>);
  const ta={width:"100%",fontFamily:FONT_MONO,fontSize:12,lineHeight:1.5,padding:12,border:`1px solid ${LINE}`,borderRadius:10,boxSizing:"border-box",resize:"vertical",background:"#fbfaf7",color:INK};

  return (
    <div style={{fontFamily:FONT_DISPLAY,background:PAPER,minHeight:"100vh",color:INK,padding:"24px 22px 44px"}}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Archivo:wght@500;700;800&family=Space+Mono:wght@400;700&display=swap'); @media print { body * { visibility: hidden; } #print-area, #print-area * { visibility: visible; } #print-area { position: absolute; left: 0; top: 0; width: 100%; } }`}</style>
      <div style={{maxWidth:1180,margin:"0 auto"}}>
        <div style={{marginBottom:16}}>
          <div style={{fontFamily:FONT_MONO,fontSize:11,letterSpacing:2,color:MUTED,textTransform:"uppercase"}}>Optimizer · WFL — Window Flow Language</div>
          <h1 style={{fontWeight:800,fontSize:30,margin:"4px 0 0",letterSpacing:-0.5}}>Rules → KPIs, actions &amp; schedules</h1>
          <div style={{fontSize:13,color:MUTED,marginTop:4}}>Write logic over SQL columns; it computes live. Edits re-run instantly.</div>
        </div>

        <div style={{display:"flex",gap:14,alignItems:"flex-start",flexWrap:"wrap"}}>
          {/* editors */}
          <div style={{flex:"1 1 440px",minWidth:300,display:"flex",flexDirection:"column",gap:12}}>
            <div>
              <div style={{fontFamily:FONT_MONO,fontSize:10,letterSpacing:1,color:MUTED,textTransform:"uppercase",marginBottom:6}}>Program · WFL</div>
              <textarea value={program} onChange={e=>setProgram(e.target.value)} spellCheck={false} style={{...ta,height:330}}/>
            </div>
            <div>
              <div style={{fontFamily:FONT_MONO,fontSize:10,letterSpacing:1,color:MUTED,textTransform:"uppercase",marginBottom:6}}>Input data · order rows (SQL columns)</div>
              <textarea value={dataText} onChange={e=>setDataText(e.target.value)} spellCheck={false} style={{...ta,height:150}}/>
            </div>
            {!result.ok && <div style={{background:hexA(HOT,0.08),border:`1px solid ${hexA(HOT,0.4)}`,color:HOT,borderRadius:8,padding:"10px 12px",fontFamily:FONT_MONO,fontSize:12}}>⚠ {result.error}</div>}
          </div>

          {/* output */}
          <div style={{flex:"1 1 440px",minWidth:300}}>
            <div style={{display:"flex",gap:6,background:CARD,border:`1px solid ${LINE}`,borderRadius:10,padding:5,width:"fit-content",marginBottom:12,flexWrap:"wrap"}}>
              <Tab id="kpi">KPIs</Tab><Tab id="cta">Actions</Tab><Tab id="truck">Trucks</Tab><Tab id="work">Schedule</Tab><Tab id="syntax">Syntax</Tab>
            </div>

            {result.ok && tab==="kpi" && (<div>
              <div style={{display:"flex",gap:10,flexWrap:"wrap",marginBottom:14}}>
                {result.kpis.map((k,i)=>(<div key={i} style={{background:CARD,border:`1px solid ${LINE}`,borderRadius:10,padding:"12px 14px",flex:"1 1 120px"}}>
                  <div style={{fontFamily:FONT_MONO,fontSize:10,letterSpacing:1,textTransform:"uppercase",color:MUTED}}>{k.label}</div>
                  <div style={{fontFamily:FONT_DISPLAY,fontWeight:800,fontSize:28}}>{fmtNum(k.value)}</div>
                </div>))}
              </div>
              <div style={{background:CARD,border:`1px solid ${LINE}`,borderRadius:10,padding:14}}>
                <div style={{fontFamily:FONT_MONO,fontSize:10,letterSpacing:1,color:MUTED,textTransform:"uppercase",marginBottom:10}}>Stage distribution</div>
                {stageDist.map(s=>(<div key={s.stage} style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
                  <span style={{fontFamily:FONT_MONO,fontSize:11,width:54,color:INK}}>{s.stage}</span>
                  <div style={{flex:1,height:14,background:"#eceef2",borderRadius:4,overflow:"hidden"}}><div style={{width:`${s.n/result.computed.length*100}%`,height:"100%",background:BLUE,borderRadius:4}}/></div>
                  <span style={{fontFamily:FONT_MONO,fontSize:11,width:18,textAlign:"right"}}>{s.n}</span>
                </div>))}
              </div>
            </div>)}

            {result.ok && tab==="cta" && (<div style={{display:"flex",flexDirection:"column",gap:8}}>
              {result.ctas.length===0 && <div style={{color:MUTED,fontSize:13}}>No rules fired.</div>}
              {result.ctas.map((a,i)=>{const s=SEV[a.sev];return (
                <div key={i} style={{background:CARD,border:`1px solid ${LINE}`,borderLeft:`5px solid ${s.c}`,borderRadius:10,padding:"11px 13px",display:"flex",gap:10}}>
                  <span style={{color:s.c,fontSize:15}}>{s.icon}</span>
                  <div><div style={{display:"flex",gap:8,alignItems:"center",marginBottom:2}}>
                    <span style={{fontFamily:FONT_MONO,fontSize:9,fontWeight:700,letterSpacing:1,color:s.c,background:hexA(s.c,0.12),borderRadius:4,padding:"2px 6px"}}>{s.label}</span>
                    <span style={{fontFamily:FONT_MONO,fontSize:11,color:MUTED}}>{a.id}</span></div>
                    <div style={{fontWeight:700,fontSize:14}}>{a.msg}</div></div>
                </div>);})}
            </div>)}

            {result.ok && tab==="truck" && (<div style={{display:"flex",flexDirection:"column",gap:10}}>
              {trucks.map(t=>{const c=t.pcs>=TRUCK?OK:HOT;return(
                <div key={t.dest} style={{background:CARD,border:`1px solid ${LINE}`,borderRadius:10,padding:14}}>
                  <div style={{display:"flex",justifyContent:"space-between"}}><div style={{fontWeight:800,fontSize:16}}>{t.dest}</div>
                    <span style={{fontFamily:FONT_MONO,fontSize:11,fontWeight:700,color:c,background:hexA(c,0.12),borderRadius:6,padding:"3px 8px"}}>{t.pcs>=TRUCK?"READY":"SHORT"}</span></div>
                  <div style={{display:"flex",alignItems:"center",gap:8,margin:"10px 0 4px"}}>
                    <div style={{flex:1,height:10,background:"#eceef2",borderRadius:999,overflow:"hidden"}}><div style={{width:`${Math.min(100,t.fill)}%`,height:"100%",background:c}}/></div>
                    <span style={{fontFamily:FONT_MONO,fontSize:13,fontWeight:700}}>{t.pcs}/{TRUCK}</span></div>
                  <div style={{fontSize:12,color:c}}>{t.pcs>=TRUCK?`+${t.pcs-TRUCK} over`:`short by ${t.short}`}</div>
                  <div style={{marginTop:8,display:"flex",gap:6,flexWrap:"wrap"}}>{t.orders.map(o=>(<span key={o} style={{fontFamily:FONT_MONO,fontSize:11,border:`1px solid ${LINE}`,borderRadius:6,padding:"2px 7px"}}>{o}</span>))}</div>
                </div>);})}
            </div>)}

            {result.ok && tab==="work" && (<div id="print-area" style={{background:CARD,border:`1px solid ${LINE}`,borderRadius:10,overflow:"hidden"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px 14px",borderBottom:`1px solid ${LINE}`}}>
                <div style={{fontWeight:800,fontSize:16}}>Work schedule · priority order</div>
                <button onClick={()=>window.print()} style={{fontFamily:FONT_MONO,fontSize:12,fontWeight:700,border:`1px solid ${LINE}`,background:PAPER,borderRadius:7,padding:"6px 12px",cursor:"pointer"}}>🖨 Print</button>
              </div>
              <table style={{width:"100%",borderCollapse:"collapse"}}><thead><tr>
                {["#","Order","Stage","Slack","Loading"].map((h,i)=>(<th key={h} style={{textAlign:i>2?"right":"left",padding:"9px 14px",fontFamily:FONT_MONO,fontSize:10,letterSpacing:1,textTransform:"uppercase",color:MUTED,borderBottom:`1px solid ${LINE}`}}>{h}</th>))}
              </tr></thead><tbody>
                {work.map((c,i)=>(<tr key={c.id} style={{background:i%2?hexA(INK,0.015):"transparent"}}>
                  <td style={{padding:"9px 14px",fontFamily:FONT_MONO,fontSize:12,color:MUTED}}>{i+1}</td>
                  <td style={{padding:"9px 14px",fontFamily:FONT_MONO,fontSize:13}}>{c.id}</td>
                  <td style={{padding:"9px 14px",fontFamily:FONT_MONO,fontSize:12}}>{c.stage}</td>
                  <td style={{padding:"9px 14px",textAlign:"right",fontFamily:FONT_MONO,fontSize:13,fontWeight:700,color:c.slack<0?HOT:c.slack<4?WARN:OK}}>{fmtNum(c.slack)}h</td>
                  <td style={{padding:"9px 14px",textAlign:"right",fontFamily:FONT_MONO,fontSize:12,color:MUTED}}>+{fmtNum(c.loading_in)}h</td>
                </tr>))}
              </tbody></table>
            </div>)}

            {tab==="syntax" && (<pre style={{background:CARD,border:`1px solid ${LINE}`,borderRadius:10,padding:14,fontFamily:FONT_MONO,fontSize:11.5,lineHeight:1.6,color:INK,whiteSpace:"pre-wrap",margin:0}}>{SYNTAX}</pre>)}
          </div>
        </div>
      </div>
    </div>
  );
}
