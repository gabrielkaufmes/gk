/* WFL — Window Flow Language. Tiny interpreter. Durations are hours (1h=1, 30m=0.5, 1d=24). */

/* ---------- Tokenizer ---------- */
const KW = new Set(["if","then","else","and","or","not","where","const","let","kpi","rule","action","when","true","false"]);
function lex(src){
  const t=[]; let i=0; const n=src.length;
  const push=(type,value)=>t.push({type,value});
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
    if(/[A-Za-z_]/.test(c)){ let j=i,id=""; while(j<n&&/[A-Za-z0-9_]/.test(src[j])){id+=src[j];j++;} i=j;
      push(KW.has(id)?id:"id",id); continue; }
    const two=src.slice(i,i+2);
    if(["==","!=",">=","<=","=>"].includes(two)){ push("op",two); i+=2; continue; }
    if("+-*/%<>(),=".includes(c)){ push("op",c); i++; continue; }
    throw new Error("Unexpected character: "+c);
  }
  push("eof");
  return t;
}

/* ---------- Parser (Pratt for expressions) ---------- */
function parse(src){
  const t=lex(src); let p=0;
  const peek=()=>t[p], next=()=>t[p++];
  const at=(type,value)=>peek().type===type&&(value===undefined||peek().value===value);
  const eat=(type,value)=>{ if(!at(type,value)) throw new Error(`Expected ${value||type} but got ${peek().type} ${peek().value??""}`); return next(); };
  const skipNl=()=>{ while(at("nl")) next(); };

  function parseExpr(){
    if(at("if")) return parseIf();
    return parseOr();
  }
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
    if(at("true")){ next(); return {k:"num",v:1,bool:true}; }
    if(at("false")){ next(); return {k:"num",v:0,bool:true}; }
    if(at("agg")) return parseAgg();
    if(at("op","(")){ next(); const e=parseExpr(); eat("op",")"); return e; }
    if(at("id")){ const name=next().value;
      if(at("op","(")){ next(); const args=[]; if(!at("op",")")){ args.push(parseExpr()); while(at("op",",")){ next(); args.push(parseExpr()); } } eat("op",")"); return {k:"call",name,args}; }
      return {k:"field",name};
    }
    throw new Error("Unexpected token in expression: "+peek().type+" "+(peek().value??""));
  }
  function parseAgg(){ const fn=next().value; eat("op","(");
    let measure=null, where=null;
    if(!at("op",")")){
      if(!at("where")) measure=parseExpr();
      if(at("where")){ next(); where=parseExpr(); }
    }
    eat("op",")"); return {k:"agg",fn,measure,where};
  }

  /* statements */
  const prog={consts:[],lets:[],kpis:[],rules:[]};
  skipNl();
  while(!at("eof")){
    if(at("const")){ next(); const name=eat("id").value; eat("op","="); prog.consts.push({name,expr:parseExpr()}); }
    else if(at("let")){ next(); const name=eat("id").value; eat("op","="); prog.lets.push({name,expr:parseExpr()}); }
    else if(at("kpi")){ next(); const label=eat("str").value; eat("op","="); prog.kpis.push({label,expr:parseExpr()}); }
    else if(at("rule")){ next(); const name=eat("str").value; eat("when"); const cond=parseExpr(); eat("op","=>"); eat("action"); eat("op","("); const sev=next().value; eat("op",","); const msg=parseExpr(); eat("op",")"); prog.rules.push({name,cond,sev,msg}); }
    else throw new Error("Unknown statement: "+peek().type+" "+(peek().value??""));
    if(!at("eof")) eat("nl"); skipNl();
  }
  return prog;
}
// `when` isn't a keyword above; add handling: treat bare id "when"

/* ---------- Evaluator ---------- */
function fmtNum(n){ if(typeof n!=="number"||!isFinite(n)) return String(n); return Number.isInteger(n)?String(n):String(Math.round(n*10)/10); }
const truthy=(v)=> typeof v==="number"? v!==0 : !!v;

function evalExpr(node, scope, ctx){
  switch(node.k){
    case "num": return node.v;
    case "str": return node.v;
    case "field": {
      if(node.name in scope) return scope[node.name];
      throw new Error("Unknown field/const: "+node.name);
    }
    case "un":
      if(node.op==="neg") return -evalExpr(node.e,scope,ctx);
      if(node.op==="not") return truthy(evalExpr(node.e,scope,ctx))?0:1;
      break;
    case "bin": {
      const op=node.op;
      if(op==="and") return truthy(evalExpr(node.l,scope,ctx))&&truthy(evalExpr(node.r,scope,ctx))?1:0;
      if(op==="or")  return truthy(evalExpr(node.l,scope,ctx))||truthy(evalExpr(node.r,scope,ctx))?1:0;
      const l=evalExpr(node.l,scope,ctx), r=evalExpr(node.r,scope,ctx);
      switch(op){
        case "+": return (typeof l==="string"||typeof r==="string")? (lstr(l)+lstr(r)) : l+r;
        case "-": return l-r; case "*": return l*r; case "/": return l/r; case "%": return l%r;
        case "==": return l===r?1:0; case "!=": return l!==r?1:0;
        case "<": return l<r?1:0; case "<=": return l<=r?1:0; case ">": return l>r?1:0; case ">=": return l>=r?1:0;
      }
      break;
    }
    case "if": return truthy(evalExpr(node.c,scope,ctx))?evalExpr(node.a,scope,ctx):evalExpr(node.b,scope,ctx);
    case "call": {
      const a=node.args.map(x=>evalExpr(x,scope,ctx));
      const f={ max:Math.max, min:Math.min, abs:Math.abs, round:Math.round, floor:Math.floor, ceil:Math.ceil }[node.name];
      if(!f) throw new Error("Unknown function: "+node.name);
      return f(...a);
    }
    case "agg": {
      const rows=ctx.dataset.filter(r=> node.where? truthy(evalExpr(node.where, ctx.rowScope(r), ctx)) : true);
      if(node.fn==="count") return rows.length;
      const vals=rows.map(r=>evalExpr(node.measure, ctx.rowScope(r), ctx));
      if(node.fn==="sum") return vals.reduce((a,b)=>a+b,0);
      if(node.fn==="avg") return vals.length? vals.reduce((a,b)=>a+b,0)/vals.length : 0;
      if(node.fn==="min") return vals.length? Math.min(...vals):0;
      if(node.fn==="max") return vals.length? Math.max(...vals):0;
      throw new Error("Unknown aggregate: @"+node.fn);
    }
  }
  throw new Error("eval fail "+node.k);
}
function lstr(v){ return typeof v==="number"? fmtNum(v) : String(v); }

/* ---------- Runner ---------- */
function run(prog, dataset){
  // consts (global, no row)
  const G={};
  for(const c of prog.consts) G[c.name]=evalExpr(c.expr, G, {dataset, rowScope:()=>G});
  // rowScope builder
  const rowScope=(row)=>{ const s={...G,...row}; for(const l of prog.lets) s[l.name]=evalExpr(l.expr, s, {dataset, rowScope}); return s; };
  const ctx={dataset, rowScope};
  // kpis (aggregate context, scope=G)
  const kpis=prog.kpis.map(k=>({label:k.label, value:evalExpr(k.expr, G, ctx)}));
  // rules per row
  const SEVR={critical:0, action:1, review:2};
  const ctas=[];
  for(const row of dataset){ const s=rowScope(row);
    for(const ru of prog.rules){ if(truthy(evalExpr(ru.cond, s, ctx))){ ctas.push({sev:SEVR[ru.sev]??1, rule:ru.name, id:row.id, msg:lstr(evalExpr(ru.msg, s, ctx))}); } }
  }
  ctas.sort((a,b)=>a.sev-b.sev);
  // computed rows (for engine)
  const computed=dataset.map(r=>rowScope(r));
  return {kpis, ctas, computed};
}

export { parse, run };
