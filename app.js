(()=>{"use strict";
const C=window.MARGINALIA_CONFIG||{},K="marginalia.token",P="marginalia.pkce",POS="marginalia.pos.",$=id=>document.getElementById(id);
const e={w:$("welcome"),l:$("library"),r:$("reader"),g:$("grid"),s:$("status"),c:$("connect"),c2:$("connect2"),toc:$("toc"),tl:$("tocLinks"),tb:$("tocButton"),bh:$("bookHead"),body:$("content")};
let books=[],current=null;
const show=x=>{[e.w,e.l,e.r].forEach(y=>y.hidden=y!==x);e.tb.hidden=x!==e.r};
const token=()=>localStorage.getItem(K),redir=()=>location.origin+location.pathname;
const b64=b=>btoa(String.fromCharCode(...b)).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"" );
async function connect(){if(!C.DROPBOX_APP_KEY||C.DROPBOX_APP_KEY.includes("PASTE_")){e.s.textContent="Add your Dropbox app key to config.js first.";return}let v=b64(crypto.getRandomValues(new Uint8Array(64)));sessionStorage.setItem(P,v);let h=new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(v)));let q=new URLSearchParams({client_id:C.DROPBOX_APP_KEY,response_type:"code",code_challenge:b64(h),code_challenge_method:"S256",redirect_uri:redir()});location.href="https://www.dropbox.com/oauth2/authorize?"+q}
async function oauth(){let q=new URLSearchParams(location.search),code=q.get("code");if(!code)return;let v=sessionStorage.getItem(P);if(!v)throw Error("Dropbox sign-in state was lost. Connect again.");let b=new URLSearchParams({code,grant_type:"authorization_code",client_id:C.DROPBOX_APP_KEY,code_verifier:v,redirect_uri:redir()});let r=await fetch("https://api.dropboxapi.com/oauth2/token",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:b});if(!r.ok)throw Error("Dropbox sign-in could not be completed.");let d=await r.json();localStorage.setItem(K,d.access_token);history.replaceState({},"",location.pathname)}
async function api(ep,arg,content=false){let h={Authorization:"Bearer "+token()};if(content)h["Dropbox-API-Arg"]=JSON.stringify(arg);else h["Content-Type"]="application/json";let r=await fetch((content?"https://content.dropboxapi.com/2/":"https://api.dropboxapi.com/2/")+ep,{method:"POST",headers:h,body:content?undefined:JSON.stringify(arg)});if(!r.ok)throw Error("Dropbox request failed.");return content?r:r.json()}
async function list(path){let d=await api("files/list_folder",{path}),a=[...d.entries];while(d.has_more){d=await api("files/list_folder/continue",{cursor:d.cursor});a.push(...d.entries)}return a}
async function text(path){return(await api("files/download",{path},true)).text()}
async function img(path){try{let b=await(await api("files/download",{path},true)).blob();return URL.createObjectURL(b)}catch{return null}}
function fm(t){let m={},body=t;if(t.startsWith("---")){let n=t.indexOf("\n---",3);if(n>0){t.slice(3,n).trim().split(/\r?\n/).forEach(x=>{let i=x.indexOf(":");if(i>0)m[x.slice(0,i).trim()]=x.slice(i+1).trim().replace(/^[\"']|[\"']$/g,"")});body=t.slice(n+4).replace(/^\s+/,"")}}return{m,body}}
const esc=s=>String(s||"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));

function extractFootnotes(md){
  const defs=new Map(),numbers=new Map(),order=[],refCounts=new Map();
  md=md.replace(/^\[\^([^\]]+)\]:\s*(.+)$/gm,(_,id,value)=>{defs.set(id.trim(),value.trim());return ""});
  md=md.replace(/\[\^([^\]]+)\]/g,(whole,idRaw)=>{
    const id=idRaw.trim();
    if(!defs.has(id))return whole;
    if(!numbers.has(id)){numbers.set(id,order.length+1);order.push(id)}
    const n=numbers.get(id),count=(refCounts.get(id)||0)+1;
    refCounts.set(id,count);
    const safe=id.replace(/[^a-zA-Z0-9_-]/g,"-");
    return `<sup class="footnote-ref" id="fnref-${safe}-${count}"><a href="#fn-${safe}" aria-label="Footnote ${n}">${n}</a></sup>`;
  });
  return{md,defs,numbers,order};
}
function footnotesHtml(f){
  if(!f.order.length)return "";
  return `<section class="footnotes" aria-label="Notes"><h2>Notes</h2><ol>${f.order.map(id=>{
    const safe=id.replace(/[^a-zA-Z0-9_-]/g,"-");
    const content=marked.parseInline(f.defs.get(id)||"");
    return `<li id="fn-${safe}">${content} <a class="footnote-back" href="#fnref-${safe}-1" aria-label="Back to text">↩</a></li>`;
  }).join("")}</ol></section>`;
}
function enhanceCallouts(){
  const labels={"KEY IDEA":"Key idea","EVIDENCE":"The evidence","CRITICAL QUESTION":"Critical question","DON'T MISUNDERSTAND":"Don’t misunderstand the argument"};
  e.body.querySelectorAll("blockquote").forEach(q=>{
    const p=q.querySelector("p");if(!p)return;
    const m=p.innerHTML.match(/^\[!(KEY IDEA|EVIDENCE|CRITICAL QUESTION|DON'T MISUNDERSTAND)\]\s*/i);if(!m)return;
    const key=m[1].toUpperCase();p.innerHTML=p.innerHTML.replace(m[0],"");
    q.classList.add("callout",key.toLowerCase().replace(/[^a-z]+/g,"-"));
    const label=document.createElement("div");label.className="callout-label";label.textContent=labels[key]||key;
    q.insertBefore(label,q.firstChild);
  });
}
async function library(){show(e.l);e.g.innerHTML="<p>Loading library…</p>";try{let fs=(await list(C.DROPBOX_FOLDER)).filter(x=>x[".tag"]==="folder");books=(await Promise.all(fs.map(async f=>{try{let md=await text(f.path_lower+"/companion.md"),{m}=fm(md),cover=await img(f.path_lower+"/"+(m.cover||"cover.jpg"));return{path:f.path_lower,title:m.title||f.name,author:m.author||"",md,cover}}catch{return null}}))).filter(Boolean).sort((a,b)=>a.title.localeCompare(b.title));render()}catch(x){e.g.innerHTML="<p>"+esc(x.message)+"</p>"}}
function render(){e.g.innerHTML=books.length?"":"<p>No commentaries found.</p>";books.forEach(b=>{let x=document.createElement("button");x.className="book";x.innerHTML=b.cover?`<img class="cover" src="${b.cover}" alt="">`:`<div class="cover">${esc(b.title)}</div>`;x.innerHTML+=`<strong>${esc(b.title)}</strong><span>${esc(b.author)}</span>`;x.onclick=()=>openBook(b);e.g.appendChild(x)})}
function openBook(b){
  current=b;let{m,body}=fm(b.md),f=extractFootnotes(body);
  e.bh.innerHTML=`<p class="kicker">MARGINALIA</p><h1>${esc(m.title||b.title)}</h1>${m.subtitle?`<p class="sub">${esc(m.subtitle)}</p>`:""}${m.author?`<p class="by">${esc(m.author)}${m.year?" · "+esc(m.year):""}</p>`:""}`;
  e.body.innerHTML=marked.parse(f.md)+footnotesHtml(f);
  enhanceCallouts();
  let seen={};[...e.body.querySelectorAll("h1,h2,h3")].filter(h=>!h.closest(".footnotes")).forEach(h=>{let id=h.textContent.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"")||"section";seen[id]=(seen[id]||0)+1;if(seen[id]>1)id+="-"+seen[id];h.id=id});
  e.tl.innerHTML="";[...e.body.querySelectorAll("h1,h2,h3")].filter(h=>!h.closest(".footnotes")).forEach(h=>{let a=document.createElement("a");a.href="#"+h.id;a.textContent=h.textContent;a.className=h.tagName.toLowerCase();a.onclick=()=>e.toc.classList.remove("open");e.tl.appendChild(a)});
  show(e.r);requestAnimationFrame(()=>scrollTo(0,Number(localStorage.getItem(POS+b.path)||0)))
}
e.c.onclick=e.c2.onclick=connect;$("refresh").onclick=library;$("home").onclick=()=>token()?library():show(e.w);$("back").onclick=library;e.tb.onclick=()=>e.toc.classList.toggle("open");$("themeButton").onclick=()=>document.documentElement.dataset.theme=document.documentElement.dataset.theme==="dark"?"light":"dark";addEventListener("scroll",()=>{if(current&&!e.r.hidden)localStorage.setItem(POS+current.path,scrollY)},{passive:true});
(async()=>{try{await oauth();token()?await library():show(e.w)}catch(x){show(e.w);e.s.textContent=x.message}})();
})();
