import {staffContext,json,cors,env} from "../_shared/instagram.ts";
Deno.serve(async req=>{
 if(req.method==="OPTIONS")return new Response(null,{headers:cors});
 if(req.method!=="POST")return json({error:"Method not allowed"},405);
 try{
  const {sb,user,organizationId}=await staffContext(req);
  if(!env("META_APP_ID")||!env("INSTAGRAM_OAUTH_REDIRECT_URI"))return json({error:"Meta application not configured"},503);
  const state=crypto.randomUUID()+"-"+crypto.randomUUID();
  const {error}=await sb.from("instagram_oauth_states").insert({state,organization_id:organizationId,initiated_by:user.id,expires_at:new Date(Date.now()+10*60*1000).toISOString()});
  if(error)throw error;
  const url=new URL("https://www.instagram.com/oauth/authorize");
  url.searchParams.set("client_id",env("META_APP_ID"));
  url.searchParams.set("redirect_uri",env("INSTAGRAM_OAUTH_REDIRECT_URI"));
  url.searchParams.set("response_type","code");
  url.searchParams.set("scope","instagram_business_basic,instagram_business_manage_messages");
  url.searchParams.set("state",state);
  return json({authorization_url:url.toString()});
 }catch(e){return json({error:e.message},e.message==="Unauthorized"?401:e.message==="Forbidden"?403:500)}
});
