"use client";
import { activateSnapshot } from "@/lib/imports/snapshot-store";
import { importFetch } from "@/lib/imports/client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { browserClient } from "@/lib/supabase/browser";
import { readRows, rowProblem, type ImportJob, type ImportRow, type Snapshot } from "@/lib/imports/types";
import { parseReviewCsv } from "./csv";
import { usePortfolio } from "@/lib/portfolio-store";
import { SnapshotHistory } from "./snapshot-history";

const style="rounded border border-border-strong bg-surface-1 px-3 py-2 text-text disabled:opacity-50";
const empty=():ImportRow=>({ticker:"",name:"",kind:"unknown",shares:null,marketValue:null,valuationDate:""});
async function send(body:unknown) {
  const res=await importFetch("/api/imports",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
  const data=await res.json(); if(!res.ok) throw new Error(data.error); return data;
}
export function ImportFlow() {
  const router=useRouter();
  const [email,setEmail]=useState(""); const [token,setToken]=useState(""); const [sent,setSent]=useState(false);
  const [signedIn,setSignedIn]=useState(false); const [loaded,setLoaded]=useState(!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  const [jobs,setJobs]=useState<ImportJob[]>([]); const [snapshots,setSnapshots]=useState<Snapshot[]>([]);
  const [moreHistory,setMoreHistory]=useState(true);
  const [events,setEvents]=useState<{id:number;job_id:string;created_at:string;event:string;detail:unknown}[]>([]);
  const [job,setJob]=useState<ImportJob|null>(null); const [rows,setRows]=useState<ImportRow[]>([empty()]);
  const [image,setImage]=useState<string|null>(null); const imageRef=useRef<string|null>(null);
  const [error,setError]=useState(""); const [busy,setBusy]=useState(false); const [reviewed,setReviewed]=useState(false);
  const [original,setOriginal]=useState<ImportRow[]|null>(null);
  const generation=useRef(0);
  const activated=useRef<string|null>(null);
  function clearImage(){if(imageRef.current) URL.revokeObjectURL(imageRef.current);imageRef.current=null;setImage(null);}
  async function reload() {
    const run=generation.current;
    const response=await importFetch("/api/imports",{cache:"no-store"});
    if(run!==generation.current)return;
    if(response.status===401){setSignedIn(false);return;}
    const data=await response.json(); if(run!==generation.current)return; if(!response.ok) throw new Error(data.error);
    setJobs(data.jobs);setSnapshots(current=>[...new Map<string,Snapshot>([...current,...data.snapshots].map((s:Snapshot)=>[s.id,s])).values()].sort((a,b)=>b.created_at.localeCompare(a.created_at)));setEvents(data.events);
    if(data.snapshots.length<30)setMoreHistory(false);
    setJob(current=>current?data.jobs.find((j:ImportJob)=>j.id===current.id)??current:current);
  }
  useEffect(()=>{
    const client=browserClient();
    if(!client)return;
    const {data}=client.auth.onAuthStateChange((_event,session)=>{setSignedIn(Boolean(session));setLoaded(true);if(!session){generation.current++;setJob(null);setRows([empty()]);setJobs([]);setSnapshots([]);setEvents([]);usePortfolio.getState().resetToDemo();if(imageRef.current)URL.revokeObjectURL(imageRef.current);imageRef.current=null;setImage(null);}});
    client.auth.getUser().then(({data})=>{setSignedIn(Boolean(data.user));setLoaded(true);});
    return()=>{data.subscription.unsubscribe();if(imageRef.current) URL.revokeObjectURL(imageRef.current);};
  },[]);
  useEffect(()=>{
    if(!signedIn)return;
    let cancelled=false;
    const load=()=>{if(!cancelled)void reload().catch(e=>setError(e.message));};
    load();const timer=setInterval(load,5000);return()=>{cancelled=true;clearInterval(timer);};
  },[signedIn]);
  useEffect(()=>{
    if(job?.status!=="complete" || !job.snapshot_id || activated.current===job.snapshot_id)return;
    const snapshot=snapshots.find(s=>s.id===job.snapshot_id);
    if(snapshot){activateSnapshot(snapshot);activated.current=snapshot.id;}
  },[job,snapshots]);
  const imageJob=job?.source==="screenshot"&&!job.confirmed_at?job.id:null;
  useEffect(()=>{
    if(!imageJob)return;
    const controller=new AbortController();
    importFetch(`/api/imports/image?id=${encodeURIComponent(imageJob)}`,{cache:"no-store",signal:controller.signal}).then(async res=>{
      if(!res.ok)throw new Error("The temporary screenshot expired. Upload it again before confirming review.");
      const blob=await res.blob();if(controller.signal.aborted)return;
      if(imageRef.current)URL.revokeObjectURL(imageRef.current);
      imageRef.current=URL.createObjectURL(blob);setImage(imageRef.current);
    }).catch(e=>{if(!controller.signal.aborted)setError(e.message);});
    return()=>controller.abort();
  },[imageJob]);
  async function act(fn:()=>Promise<void>){setBusy(true);setError("");try{await fn();}catch(e){setError(e instanceof Error?e.message:"Request failed");}finally{setBusy(false);}}
  function edit(index:number,patch:Partial<ImportRow>){setReviewed(false);setRows(rs=>rs.map((r,i)=>i===index?{...r,...patch}:r));}
  async function upload(file:File) {
    const run=++generation.current;
    clearImage();setReviewed(false);setJob(null);
    if(file.size>4*1024*1024)throw new Error("Choose a file under 4 MB.");
    if(/\.(csv|txt)$/i.test(file.name)) {
      const parsed=parseReviewCsv(await file.text());
      if(parsed.error)throw new Error(parsed.error);
      // Skipped rows are retained as unresolved review rows, never silently discarded.
      const all=readRows([...parsed.rows,...parsed.skipped.map(s=>({ticker:"",name:`Line ${s.line}: ${s.text} (${s.reason})`}))]);
      const data=await send({action:"create",id:crypto.randomUUID(),rows:all,source:"rows"});
      setJob(data.job);setRows(all);setOriginal(all);await reload();return;
    }
    if(!file.type.startsWith("image/"))throw new Error("Choose an image or CSV file.");
    imageRef.current=URL.createObjectURL(file);setImage(imageRef.current);
    const body=new FormData();body.append("file",file);
    const res=await importFetch("/api/imports/screenshot",{method:"POST",body});const data=await res.json();
    if(!res.ok)throw new Error(data.error);
    if(run!==generation.current)return;
    setJob(data.job);setRows(data.job.rows);setOriginal(data.job.original);await reload();
  }
  async function confirm(){
    let current=job;
    if(!current) {const data=await send({action:"create",id:crypto.randomUUID(),rows:original??rows,source:"rows"});current=data.job;setJob(current);}
    const data=await send({action:"confirm",id:current!.id,revision:current!.revision,rows});
    setJob(data.job);clearImage();setOriginal(null);await reload();
  }
  function open(snapshot:Snapshot){
    activateSnapshot(snapshot);
    router.push("/xray");
  }
  const editable=!job || job.status==="review" || job.status==="needs_input";
  const issues=rows.map(rowProblem); const ready=reviewed && !issues.some(Boolean) && rows.some(r=>!r.excluded);
  return <main className="bx-container py-10 space-y-6">
    <header className="flex justify-between"><Link href="/" className="text-2xl">Aperture</Link><Link href="/xray">Current X-Ray</Link></header>
    <h1 className="text-4xl">Import your portfolio</h1>
    <p>Every row stays visible. Review holdings, resolve missing information, then follow pricing progress. Your X-Ray opens only when the analysis is ready.</p>
    <p className="text-sm text-text-muted">Screenshots are kept privately during review, for up to one hour, and deleted when you confirm or log out. Reviewed CSV records remain in your audit history.</p>
    <p><Link href="/xray" className="underline" onClick={()=>usePortfolio.getState().resetToDemo()}>Explore the sample portfolio</Link></p>
    {error&&<p role="alert" className="border border-red-500 p-3">{error}</p>}
    {!loaded?<p>Loading account…</p>:!signedIn?<section className="space-y-3 max-w-lg">
      <p>Sign in to see your saved imports.</p>
      <label className="block">Email address<input aria-label="Email" placeholder="you@example.com" className={`${style} block w-full mt-2`} type="email" value={email} onChange={e=>setEmail(e.target.value)}/></label>
      {!sent?<button className={style} disabled={busy} onClick={()=>act(async()=>{const client=browserClient();if(!client)throw new Error("Supabase is not configured. See docs/IMPORTS.md.");const {error}=await client.auth.signInWithOtp({email});if(error)throw error;setSent(true);})}>Send sign-in code</button>:<>
      <input aria-label="Email code" className={style} value={token} onChange={e=>setToken(e.target.value)}/><button className={style} disabled={busy} onClick={()=>act(async()=>{const {error}=await browserClient()!.auth.verifyOtp({email,token,type:"email"});if(error)throw error;})}>Sign in</button></>}
    </section>:<>
      <div className="flex flex-wrap gap-3"><input aria-label="Upload screenshot or CSV" type="file" accept="image/*,.csv,.txt" disabled={busy} onChange={e=>{const f=e.target.files?.[0];e.target.value="";if(f)void act(()=>upload(f));}}/>
      <button className={style} disabled={busy} onClick={()=>{clearImage();setJob(null);setRows([empty()]);setOriginal(null);setReviewed(false);}}>New manual import</button>
      <button className={style} disabled={busy} onClick={()=>act(async()=>{generation.current++;const res=await importFetch("/api/imports/logout",{method:"POST"});if(!res.ok)throw new Error("Logout failed; retry.");await browserClient()!.auth.signOut();clearImage();usePortfolio.getState().resetToDemo();setSignedIn(false);})}>Log out</button></div>
      {image&&<div className="max-h-96 overflow-auto border border-border-strong"><Image src={image} alt="Original brokerage screenshot for comparison" width={1200} height={800} unoptimized className="h-auto max-w-full"/></div>}
      {editable?<section className="space-y-4">
        <h2 className="text-xl">Review every holding</h2><p>Confirm type and quantity. A market value needs its date.</p>
        {job?.source==="screenshot"&&!image&&<p role="alert">The temporary screenshot is no longer available. Upload it again to complete the required comparison.</p>}
        <div className="overflow-auto max-h-[600px]"><table className="w-full text-sm"><thead><tr>{["Ticker / name","Type","Shares","Market value (USD)","Value date","Exclude / reason","Status"].map(h=><th key={h} className="p-2 text-left">{h}</th>)}</tr></thead><tbody>
          {rows.map((r,i)=><tr key={i} className="border-t border-border-strong"><td className="p-2"><input aria-label={`Ticker row ${i+1}`} className={`${style} w-28`} value={r.ticker} onChange={e=>edit(i,{ticker:e.target.value.toUpperCase()})}/><input aria-label={`Name row ${i+1}`} className={`${style} w-44`} value={r.name} onChange={e=>edit(i,{name:e.target.value})}/></td>
          <td><select aria-label={`Type row ${i+1}`} className={style} value={r.kind} onChange={e=>edit(i,{kind:e.target.value as ImportRow["kind"]})}><option value="unknown">Confirm type</option><option value="stock">US stock</option><option value="etf">US ETF</option><option value="cash">USD cash</option></select></td>
          <td><input aria-label={`Shares row ${i+1}`} className={`${style} w-28`} type="number" step="any" value={r.shares??""} onChange={e=>edit(i,{shares:e.target.value===""?null:Number(e.target.value)})}/></td>
          <td><input aria-label={`Market value row ${i+1}`} className={`${style} w-32`} type="number" step="any" value={r.marketValue??""} onChange={e=>edit(i,{marketValue:e.target.value===""?null:Number(e.target.value)})}/></td>
          <td><input aria-label={`Valuation date row ${i+1}`} className={style} type="date" value={r.valuationDate} onChange={e=>edit(i,{valuationDate:e.target.value})}/></td>
          <td><input aria-label={`Exclude row ${i+1}`} type="checkbox" checked={r.excluded??false} onChange={e=>edit(i,{excluded:e.target.checked})}/>{r.excluded&&<input aria-label={`Exclusion reason row ${i+1}`} className={style} value={r.exclusionReason??""} onChange={e=>edit(i,{exclusionReason:e.target.value})}/>}</td>
          <td className="p-2 min-w-48">{issues[i]??job?.results[i]?.error??"Ready for review"}{job?.results[i]?.valuation&&<p>Quote: ${job.results[i].valuation!.price.toFixed(2)} · {job.results[i].valuation!.asOf}</p>}</td></tr>)}
        </tbody></table></div>
        <button className={style} onClick={()=>{setRows(rs=>[...rs,empty()]);setReviewed(false);}}>Add missed holding</button>
        <label className="block"><input type="checkbox" checked={reviewed} onChange={e=>setReviewed(e.target.checked)}/> These rows match my source.</label>
        <button className={style} disabled={busy||!ready||(job?.source==="screenshot"&&!image&&!job.confirmed_at)} onClick={()=>act(confirm)}>Confirm review and price portfolio</button>
      </section>:<section aria-live="polite" className="space-y-3"><h2 className="text-xl">{job.status==="complete"?"Analysis complete":"Processing portfolio"}</h2>
        <p>{job.results.filter(r=>r.state==="ready").length} of {job.rows.length} processed · {job.results.filter(r=>r.state==="blocked"||r.state==="needs_input").length} need attention</p>
        <progress className="w-full" max={job.rows.length} value={job.results.filter(r=>r.state==="ready").length}/>
        <p>You can leave; processing resumes where it stopped.</p>
        <ul>{job.rows.map((r,i)=><li key={i}>{r.ticker||r.name}: {job.results[i]?.state??"pending"} {job.results[i]?.error} {job.results[i]?.retryAt&&`— next attempt ${new Date(job.results[i].retryAt!).toLocaleString()}`}</li>)}</ul>
        {job.snapshot_id&&snapshots.find(s=>s.id===job.snapshot_id)&&<button className={style} onClick={()=>open(snapshots.find(s=>s.id===job.snapshot_id)!)}>Open completed X-Ray</button>}
      </section>}
      <section className="space-y-2"><h2 className="text-xl">Saved imports</h2>{jobs.map(j=><button key={j.id} className={`${style} block w-full text-left`} onClick={()=>{clearImage();setJob(j);setRows(j.rows);setOriginal(j.original);setReviewed(false);}}>{new Date(j.created_at).toLocaleString()} — {j.rows.length} rows — {j.status}</button>)}</section>
      <SnapshotHistory snapshots={snapshots} busy={busy} onOpen={open} onRefresh={snapshot=>void act(async()=>{const draft=await send({action:"create",id:crypto.randomUUID(),rows:snapshot.rows,source:"rows"});const data=await send({action:"confirm",id:draft.job.id,revision:draft.job.revision,rows:snapshot.rows});clearImage();setJob(data.job);setRows(data.job.rows);setReviewed(false);await reload();})}/>
      {moreHistory&&snapshots.length>=30&&<button className={style} disabled={busy} onClick={()=>act(async()=>{const res=await importFetch(`/api/imports?historyOffset=${snapshots.length}`,{cache:"no-store"});const data=await res.json();if(!res.ok)throw new Error(data.error);setSnapshots(current=>[...new Map<string,Snapshot>([...current,...data.snapshots].map((s:Snapshot)=>[s.id,s])).values()].sort((a,b)=>b.created_at.localeCompare(a.created_at)));setMoreHistory(data.snapshots.length===30);})}>Load older snapshots</button>}
      {job&&<details><summary>Source CSV records and hashes</summary><p>Original extraction SHA-256: <code>{job.original_hash}</code></p><pre className="overflow-auto text-xs">{job.original_csv}</pre>{job.reviewed_csv&&<><p>Reviewed CSV SHA-256: <code>{job.reviewed_hash}</code></p><p>Portfolio identity SHA-256: <code>{job.holdings_hash}</code></p><pre className="overflow-auto text-xs">{job.reviewed_csv}</pre></>}</details>}
      <section>
      <details><summary>Chronological audit records</summary>{[...events].reverse().map(e=><details key={e.id}><summary>{new Date(e.created_at).toLocaleString()} · {e.event}</summary><pre className="whitespace-pre-wrap text-xs">{JSON.stringify(e.detail,null,2)}</pre></details>)}</details></section>
    </>}
  </main>;
}
