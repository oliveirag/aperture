import { admin, apiError, requireUser } from "@/lib/supabase/server";
export async function GET(request:Request) {
  try {
    const user=await requireUser();const id=new URL(request.url).searchParams.get("id");
    const {data,error}=await admin().from("import_images").select("image_data,mime_type").eq("job_id",id).eq("owner_id",user.id).gt("expires_at",new Date().toISOString()).single();
    if(error||!data)return new Response("Temporary image expired. Upload again.",{status:404});
    return new Response(Buffer.from(data.image_data,"base64"),{headers:{"Content-Type":data.mime_type,"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"}});
  }catch(e){return apiError(e);}
}
