import { admin, apiError, requireUser } from "@/lib/supabase/server";
export async function GET(request:Request) {
  try {
    const user=await requireUser();
    const id=new URL(request.url).searchParams.get("id");
    const {data,error}=await admin().from("portfolio_snapshots").select("*").eq("id",id).eq("owner_id",user.id).single();
    if(error || !data)throw new Error("Snapshot not found for this account.");
    return Response.json(data,{headers:{"Cache-Control":"no-store"}});
  }catch(e){return apiError(e);}
}
