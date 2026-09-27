// Real React components/hooks in Chromium; only app HTTP/auth boundaries are
// controlled. No provider traffic, DB, secrets, or installed dependencies.
// PLAYWRIGHT_MODULE can point to an existing local Playwright installation.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { execFileSync } from "node:child_process";
import { build } from "esbuild";
import { computeXray } from "../src/lib/xray/compute";

async function main() {
  const playwrightModule = process.env.PLAYWRIGHT_MODULE ?? "playwright";
  const { chromium } = await import(playwrightModule);
  const bundle = await build({
    stdin: { resolveDir: process.cwd(), loader: "tsx", contents: `
      import React from 'react';
      import {createRoot} from 'react-dom/client';
      import {ImportFlow} from './src/features/import/workspace';
      import {LivePerformance} from './src/features/xray/details/live-performance';
      import {useXray} from './src/features/xray/use-xray';
      import {useShockModel} from './src/features/shock/use-shock-model';
      import {IcRoom} from './src/features/ic-room';
      import {usePortfolio} from './src/lib/portfolio-store';
      import {useSnapshots} from './src/lib/imports/snapshot-store';
      import {useMarket,useLiveHoldings} from './src/lib/market';
      import {emitAuth} from '@/lib/supabase/browser';
      function Probe(){const x=useXray();const s=useShockModel();const h=useLiveHoldings();return <><output id="total">{h.total}</output><output id="xray">{x.status}</output><output id="shock">{s.status}</output><LivePerformance/></>}
      const root=createRoot(document.getElementById('root'));
      window.test={auth:emitAuth,selected:()=>usePortfolio.getState().imported,
        set:(holdings)=>usePortfolio.getState().setImported(holdings),
        quote:()=>useMarket.setState({status:'live',quotes:{AAPL:{price:999,change:899,changePct:8.99,prevClose:100,time:1}}}),
        mount:(page)=>{usePortfolio.setState({hydrated:true});useSnapshots.setState({hydrated:true});root.render(page==='workspace'?<ImportFlow/>:page==='ic'?<IcRoom/>:<Probe/>);}};
    ` }, bundle: true, write: false, format: "iife", platform: "browser", jsx: "automatic",
    define: { "process.env.NODE_ENV": '"test"', "process.env.NEXT_PUBLIC_SUPABASE_URL": '"http://local.test"', "process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY": '"local-test-only"' },
    plugins: [{ name: "local-boundaries", setup(builder) {
      // Optional reproducible RED run without changing the worktree.
      const baseline=process.env.IMPORT_REACT_BASELINE;
      if(baseline){
        assert.match(baseline,/^[0-9a-f]{7,40}$/);
        builder.onLoad({filter:/src\/features\/import\/workspace\.tsx$/},()=>({loader:"tsx",resolveDir:process.cwd()+"/src/features/import",contents:execFileSync("git",["show",`${baseline}:src/features/import/workspace.tsx`],{encoding:"utf8"})}));
      }
      builder.onResolve({filter:/^(next\/(navigation|link|image)|@\/lib\/supabase(\/browser)?)$/},args=>({path:args.path,namespace:"test"}));
      builder.onLoad({filter:/.*/,namespace:"test"},args=>({loader:"jsx",resolveDir:process.cwd(),contents:args.path==="@/lib/supabase/browser" ? `
        let listener;let user={id:'account-a'};
        export function emitAuth(id){user=id?{id}:null;listener?.(id?'SIGNED_IN':'SIGNED_OUT',user?{user}:null);}
        export const browserClient=()=>({auth:{
          onAuthStateChange:(fn)=>{listener=fn;return {data:{subscription:{unsubscribe:()=>{listener=null;}}}}},
          getUser:async()=>({data:{user}}),getSession:async()=>({data:{session:null}}),signOut:async()=>emitAuth(null)
        }});
      ` : args.path==="@/lib/supabase" ? "export const accountsEnabled=()=>true;" : args.path==="next/navigation" ? "export const useRouter=()=>({push:(path)=>{window.opened=path}});" : `import React from 'react';export default function Element({children,unoptimized,...props}){return React.createElement('${args.path==='next/link'?'a':'img'}',props,children)}` }));
    }}],
  });
  const server = createServer((req,res)=>{res.setHeader("Content-Type",req.url==="/bundle.js"?"text/javascript":"text/html");res.end(req.url==="/bundle.js"?bundle.outputFiles[0].text:'<div id="root"></div><script src="/bundle.js"></script>');});
  await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",resolve));
  const address=server.address();assert.ok(address&&typeof address!=="string");
  const browser=await chromium.launch({headless:true});
  try {
    const page=await browser.newPage();
    const failures:string[]=[];
    page.on("pageerror",(error:Error)=>failures.push(error.message));
    const evidence={kind:"assumption" as const,source:"Synthetic reviewed user input",rationale:"Browser boundary test, not provider data"};
    const holdings=[{ticker:"AAPL",name:"Apple",industry:"Technology",kind:"stock" as const,shares:2,price:100,provenance:evidence},
      {ticker:"PRIVATE NOTE",name:"Note",industry:null,kind:"opaque" as const,shares:0,price:0,marketValue:400,provenance:evidence},
      {ticker:"USD",name:"Cash",industry:null,kind:"cash" as const,shares:0,price:0,marketValue:50,provenance:evidence}];
    const snapshot={id:"saved",portfolio_id:"p",created_at:"2025-01-01T00:00:00Z",model:computeXray(holdings),rows:[],results:holdings.map(input=>({state:"ready",attempts:0,input}))};
    const job={id:"completed",owner_id:"account-a",source:"rows",status:"complete",snapshot_id:"saved",rows:[],original:[],results:[],created_at:snapshot.created_at,revision:1};
    let pendingCreate: (()=>Promise<void>)|null=null;
    let holdCreate=false,holdConfirm=false;
    let pendingConfirm:(()=>Promise<void>)|null=null;
    let creates=0,confirms=0;
    let failHistory=false,historySeries=false;
    const requests:Record<string,unknown[][]>={aperture:[],shock:[],performance:[],ic:[]};
    await page.route("**/api/**",async (route: {request:()=>{url:()=>string;method:()=>string;postDataJSON:()=>Record<string,unknown>};fulfill:(options:unknown)=>Promise<void>})=>{
      const req=route.request(),url=new URL(req.url());
      const reply=(json:unknown)=>route.fulfill({json});
      if(url.pathname==="/api/imports" && req.method()==="GET")return reply({jobs:[job],snapshots:[snapshot],events:[]});
      if(url.pathname==="/api/imports" && req.method()==="POST"){
        const data=req.postDataJSON();
        if(data.action==="create"){
          creates++;
          const finish=()=>reply({job:{...job,id:"late-job",status:"review",snapshot_id:null,rows:data.rows,original:data.rows}});
          if(holdCreate){pendingCreate=finish;return;}
          return finish();
        }
        confirms++;
        const finish=()=>reply({job:{...job,id:"late-job"}});
        if(holdConfirm){pendingConfirm=finish;return;}
        return finish();
      }
      if(url.pathname==="/api/market")return reply({quotes:{},profiles:{}});
      const kind=url.pathname==="/api/ic/run"?"ic":url.pathname.slice(5);
      if(kind in requests){
        const data=req.postDataJSON();requests[kind].push(data.holdings as unknown[]);
        if(kind==="aperture")return reply(computeXray(data.holdings as typeof holdings));
        if(kind==="shock")return reply({total:650,colors:{},values:{},scenarios:[]});
        if(kind==="performance")return failHistory ? route.fulfill({status:503,json:{error:{code:"PROVIDER_UNAVAILABLE",message:"History unavailable in local test"}}}) : reply(historySeries ? {series:[{date:"2024-01-05",value:100},{date:"2024-01-12",value:111}],holdings:[{ticker:"AAPL",returns:{}}],excluded:[],coverage:1} : {series:[],holdings:[],excluded:[],coverage:0});
        return route.fulfill({contentType:"application/x-ndjson",body:JSON.stringify({type:"error",error:"End of local transport test"})+"\n"});
      }
      throw new Error(`Unexpected local request ${url.pathname}`);
    });
    await page.goto(`http://127.0.0.1:${address.port}`);
    await page.waitForFunction(()=>Boolean((window as unknown as {test:unknown}).test));
    // Evaluate strings to keep the harness API separate from application types.
    const starting=[{...holdings[0],ticker:"MSFT",name:"Microsoft",price:200}];
    await page.evaluate(`window.test.set(${JSON.stringify(starting)});window.test.mount('workspace')`);
    await page.getByRole("button",{name:/rows — complete/}).waitFor();
    await page.getByRole("button",{name:/rows — complete/}).click();
    await page.waitForTimeout(100);
    assert.deepEqual(await page.evaluate("window.test.selected()"),starting,"Passive history selection must not replace the global portfolio");
    await page.getByRole("button",{name:"Open completed X-Ray"}).click();
    assert.equal(await page.evaluate("window.opened"),"/xray");
    assert.equal((await page.evaluate("window.test.selected()"))[1].marketValue,400);
    // CSV response arrives after logout/account change: it cannot restore a job.
    await page.getByRole("button",{name:"New manual import"}).click();
    holdCreate=true;
    await page.getByLabel("Upload screenshot or CSV").setInputFiles({name:"input.csv",mimeType:"text/csv",buffer:Buffer.from("Symbol,Quantity,Currency\nAAPL,2,USD")});
    await page.waitForTimeout(100);
    assert.ok(pendingCreate,"CSV create should be deferred");
    await page.evaluate("window.test.auth(null);window.test.auth('account-b')");
    await (pendingCreate as ()=>Promise<void>)();pendingCreate=null;
    await page.waitForTimeout(100);
    assert.equal(await page.getByLabel("Ticker row 1").inputValue(),"");
    assert.equal(await page.locator("body").innerText().then((s:string)=>s.includes("late-job")),false);
    // Snapshot refresh must stop before confirm if create resolves for old account.
    const before=confirms;
    await page.getByRole("button",{name:"Update analysis"}).first().click();
    await page.waitForTimeout(100);assert.ok(pendingCreate);
    await page.evaluate("window.test.auth('account-c')");
    await (pendingCreate as ()=>Promise<void>)();pendingCreate=null;
    await page.waitForTimeout(100);
    assert.equal(confirms,before,"Stale refresh draft must never be confirmed for another account");
    assert.equal(await page.getByLabel("Ticker row 1").inputValue(),"");
    assert.equal(creates,2);
    // Also guard the later confirmation response, not only draft creation.
    holdCreate=false;holdConfirm=true;
    await page.getByRole("button",{name:"Update analysis"}).first().click();
    await page.waitForTimeout(100);assert.ok(pendingConfirm);
    await page.evaluate("window.test.auth(null);window.test.auth('account-d')");
    await (pendingConfirm as ()=>Promise<void>)();pendingConfirm=null;
    await page.waitForTimeout(100);
    assert.equal(await page.getByLabel("Ticker row 1").inputValue(),"");
    // A File.text() completion from the old session must not even POST a draft.
    const beforeRead=creates;
    await page.evaluate("window.originalText=File.prototype.text;File.prototype.text=function(){return new Promise(resolve=>window.finishText=resolve)}");
    await page.getByLabel("Upload screenshot or CSV").setInputFiles({name:"slow.csv",mimeType:"text/csv",buffer:Buffer.from("Symbol,Quantity,Currency\\nAAPL,2,USD")});
    await page.evaluate("window.test.auth('account-e');File.prototype.text=window.originalText;window.finishText('Symbol,Quantity,Currency\\nAAPL,2,USD')");
    await page.waitForTimeout(100);
    assert.equal(creates,beforeRead,"Stale file read must not create a job under another account");
    // Real hooks serialize all fields and invalidate caches on price/value/source changes.
    await page.evaluate(`window.test.set(${JSON.stringify(holdings)});window.test.mount('probe')`);
    await page.waitForFunction(()=>document.getElementById("xray")?.textContent==="ready"&&document.getElementById("shock")?.textContent==="ready");
    for(const key of ["aperture","shock","performance"]){assert.equal((requests[key].at(-1)!.find(h=>(h as {ticker:string}).ticker==="PRIVATE NOTE") as {marketValue:number}).marketValue,400);assert.deepEqual((requests[key].at(-1)!.find(h=>(h as {ticker:string}).ticker==="PRIVATE NOTE") as {provenance:unknown}).provenance,evidence);}
    await page.evaluate("window.test.quote()");
    assert.equal(await page.locator("#total").textContent(),"650","Background quotes cannot change only the header/performance valuation");
    const refreshed=holdings.map((h,i)=>i===0?{...h,price:110}:i===1?{...h,marketValue:450}:h);
    await page.evaluate(`window.test.set(${JSON.stringify(refreshed)})`);
    await page.waitForTimeout(150);
    for(const key of ["aperture","shock","performance"])assert.equal((requests[key].at(-1)!.find(h=>(h as {ticker:string}).ticker==="PRIVATE NOTE") as {marketValue:number}).marketValue,450,`${key} must invalidate its complete valuation identity`);
    const sourced=refreshed.map(h=>({...h,provenance:{...evidence,rationale:"New reviewed evidence"}}));
    await page.evaluate(`window.test.set(${JSON.stringify(sourced)})`);
    await page.waitForTimeout(150);
    for(const key of ["aperture","shock","performance"])assert.deepEqual((requests[key].at(-1)!.find(h=>(h as {ticker:string}).ticker==="PRIVATE NOTE") as {provenance:unknown}).provenance,sourced[1].provenance);
    await page.evaluate("window.test.mount('ic')");
    await page.getByRole("button",{name:/Run|Convene|committee/i}).first().click();
    await page.waitForTimeout(150);
    assert.deepEqual(requests.ic.at(-1),sourced,"Actual IC composer/hook must preserve the portfolio payload");
    await page.evaluate("window.test.set([]);window.test.mount('probe')");
    await page.getByText("No positions are available, so there is no price history to chart.").waitFor();
    assert.ok(!(await page.locator("body").innerText()).includes("Loading a year"));
    failHistory=true;
    const historyBefore=requests.performance.length;
    await page.evaluate(`window.test.set(${JSON.stringify(holdings)})`);
    await page.waitForTimeout(250);
    assert.equal(requests.performance.length,historyBefore+1,"A failed history request must settle, not automatically retry on every render");
    await page.getByText(/History unavailable in local test/).waitFor();
    await page.getByRole("button",{name:"Retry history"}).click();
    await page.waitForTimeout(150);
    assert.equal(requests.performance.length,historyBefore+2,"Explicit retry makes exactly one new request");
    failHistory=false;historySeries=true;
    await page.getByRole("button",{name:"Retry history"}).click();
    await page.getByText("$111",{exact:true}).waitFor();
    assert.deepEqual(failures,[]);
    console.log("React integration OK: passive history, explicit Open, stale CSV/account/logout and refresh guards, complete hook HTTP/cache identities, IC composer payload, frozen totals, empty performance.");
  } finally {await browser.close();await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
