import {admin,env,encrypted} from "../_shared/instagram.ts";
const redirect=(result:string)=>Response.redirect(new URL("/conversations?instagram="+encodeURIComponent(result),env("FOODHUB_APP_URL")||"https://www.foodhub.work").toString(),302);
Deno.serve(async req=>{
 if(req.method!=="GET")return new Response("Method not allowed",{status:405});
 const url=new URL(req.url),state=url.searchParams.get("state"),code=url.searchParams.get("code");
 if(!state||!code)return redirect("cancelled");
 const sb=admin();
 try{
  const {data:record,error}=await sb.from("instagram_oauth_states").delete().eq("state",state).gt("expires_at",new Date().toISOString()).select("organization_id").maybeSingle();
  if(error||!record)return redirect("invalid_state");
  const appId=env("META_APP_ID"),secret=env("META_APP_SECRET"),uri=env("INSTAGRAM_OAUTH_REDIRECT_URI");
  if(!appId||!secret||!uri)return redirect("not_configured");
  const form=new URLSearchParams({client_id:appId,client_secret:secret,grant_type:"authorization_code",redirect_uri:uri,code});
  const exchange=await fetch("https://api.instagram.com/oauth/access_token",{method:"POST",body:form});
  const token=await exchange.json();
  if(!exchange.ok||!token.access_token||!token.user_id)return redirect("token_error");
  // Long-lived token exchange where supported by Instagram Login.
  let accessToken=token.access_token,expiresAt=null;
  const longUrl=new URL("https://graph.instagram.com/access_token");
  longUrl.searchParams.set("grant_type","ig_exchange_token");
  longUrl.searchParams.set("client_secret",secret);
  longUrl.searchParams.set("access_token",accessToken);
  const longResponse=await fetch(longUrl);
  if(longResponse.ok){
    const long=await longResponse.json();
    if(long.access_token){accessToken=long.access_token;expiresAt=long.expires_in?new Date(Date.now()+long.expires_in*1000).toISOString():null;}
  }
  const profileResponse=await fetch("https://graph.instagram.com/me?fields=user_id,username&access_token="+encodeURIComponent(accessToken));
  const profile=profileResponse.ok?await profileResponse.json():{};
  const instagramId=String(profile.user_id||token.user_id);
  const {error:writeError}=await sb.from("instagram_connections").upsert({
    organization_id:record.organization_id,instagram_user_id:instagramId,username:profile.username||null,
    encrypted_access_token:await encrypted(accessToken),token_expires_at:expiresAt,status:"connected",connected_at:new Date().toISOString(),updated_at:new Date().toISOString()
  },{onConflict:"organization_id"});
  if(writeError)throw writeError;
  return redirect("connected");
 }catch(e){console.error("Instagram OAuth callback failed",e instanceof Error?e.name:"error");return redirect("error")}
});
