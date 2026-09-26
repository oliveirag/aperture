import { admin, apiError, requireUser, sameOrigin, userClient } from "@/lib/supabase/server";
export async function POST(request:Request) {
  try {
    sameOrigin(request); const user=await requireUser();
    const {error}=await admin().rpc("cancel_import_drafts",{p_owner:user.id,p_id:null});
    if(error) throw new Error("Unable to cancel unfinished drafts; please retry logout.");
    await (await userClient()).auth.signOut();
    return Response.json({ok:true});
  }catch(e){return apiError(e);}
}
