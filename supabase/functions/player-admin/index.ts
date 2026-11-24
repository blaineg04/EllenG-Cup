import { createClient } from "npm:@supabase/supabase-js@2";

const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,"Content-Type":"application/json"}});
const norm=(v:unknown)=>String(v||"").trim().toLowerCase();
const clean=(v:unknown)=>norm(v).normalize("NFKD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]/g,"");
const DOMAIN="@players.ellengcup.app";
const bandFromHandicap=(n:number)=>n<=9?"A":n<=17?"B":n<=25?"C":"D";

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS") return new Response("ok",{headers:cors});
  if(req.method!=="POST") return json({error:"Method not allowed"},405);
  try{
    const url=Deno.env.get("SUPABASE_URL")!;
    const anon=Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const auth=req.headers.get("Authorization")||"";
    const userClient=createClient(url,anon,{global:{headers:{Authorization:auth}},auth:{persistSession:false,autoRefreshToken:false}});
    const admin=createClient(url,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
    const {data:{user},error:userError}=await userClient.auth.getUser();
    if(userError||!user) return json({error:"Commissioner sign-in required."},401);

    const body=await req.json().catch(()=>({}));
    const draftId=String(body?.draft_id||"elleng-cup");
    const action=String(body?.action||"create_or_update");
    const {data:draft,error:draftError}=await admin.from("elleng_drafts").select("owner_id,state").eq("id",draftId).single();
    if(draftError||!draft) return json({error:"Draft not found."},404);
    if(draft.owner_id!==user.id) return json({error:"Commissioner access required."},403);
    const golfers=Array.isArray(draft.state?.golfers)?draft.state.golfers:[];

    if(action==="create_directory_login"){
      if(draftId!=="elleng-cup") return json({error:"Invalid directory scope."},400);
      const id=String(body?.directory_id||"");
      const username=clean(body?.username);
      const password=String(body?.password||"");
      if(!/^[0-9a-f-]{36}$/i.test(id)||username.length<2||username.length>64||password.length<8||password.length>72) return json({error:"Invalid directory ID, username or password."},400);
      const {data:entry,error:readError}=await admin.from("elleng_golfer_directory").select("id,player_user_id").eq("id",id).eq("owner_id",user.id).maybeSingle();
      if(readError) throw readError;
      if(!entry) return json({error:"Directory golfer not found."},404);
      if(entry.player_user_id) return json({error:"Golfer already has a login."},409);
      // Create only: never adopt or reset an existing Auth identity.
      const {data:created,error:createError}=await admin.auth.admin.createUser({email:username+DOMAIN,password,email_confirm:true});
      if(createError||!created?.user) return json({error:"Unable to create login. Choose an unused username."},409);
      const newId=created.user.id;
      const {data:linked,error:linkError}=await admin.from("elleng_golfer_directory").update({player_user_id:newId,updated_at:new Date().toISOString()}).eq("id",id).eq("owner_id",user.id).is("player_user_id",null).select("id").maybeSingle();
      if(linkError||!linked){
        // Do not delete on ambiguous database errors: the write may have succeeded.
        if(!linkError) await admin.auth.admin.deleteUser(newId);
        return json({error:"Login linking could not be confirmed. Commissioner review required."},409);
      }
      return json({ok:true,username,user_id:newId});
    }

    if(action==="list"){
      const {data,error}=await admin.from("elleng_player_accounts").select("golfer_index,user_id,username,display_name,photo_url,must_change_password").eq("draft_id",draftId).order("golfer_index");
      if(error) throw error;
      return json({ok:true,accounts:(data||[]).map((r:any)=>({golfer_index:Number(r.golfer_index),user_id:r.user_id,username:String(r.username||""),display_name:String(r.display_name||""),photo_url:String(r.photo_url||""),must_change_password:!!r.must_change_password}))});
    }

    if(action==="patch_players"){
      const raw=Array.isArray(body?.patches)?body.patches:[];
      if(!raw.length) return json({error:"No player changes were supplied."},400);
      const patches:any[]=[];
      for(const item of raw){
        const index=Number(item?.index);
        if(!Number.isInteger(index)||index<0||index>=golfers.length) return json({error:"Invalid golfer index."},400);
        const src=item?.patch&&typeof item.patch==="object"?item.patch:{};
        const patch:any={};
        if("name" in src){const name=String(src.name||"").trim();if(!name)return json({error:`Player ${index+1} needs a name.`},400);patch.name=name;}
        if("hcp" in src){const h=String(src.hcp??"").trim();if(h!==""){const n=Number(h);if(!Number.isFinite(n)||n<0||n>54)return json({error:`Handicap for player ${index+1} must be 0–54.`},400);patch.hcp=h;patch.band=bandFromHandicap(n);}else patch.hcp="";}
        if("band" in src && !("hcp" in src && String(src.hcp??"").trim()!=="")){const b=String(src.band||"").toUpperCase();if(!["A","B","C","D"].includes(b))return json({error:`Invalid band for player ${index+1}.`},400);patch.band=b;}
        if("team" in src){const t=src.team;if(t===null||t===""||t===undefined)patch.team=null;else{const n=Number(t);const teamCount=Array.isArray(draft.state?.teams)?draft.state.teams.length:0;if(!Number.isInteger(n)||n<0||n>=teamCount)return json({error:`Invalid team for player ${index+1}.`},400);patch.team=n;}}
        if("photo_url" in src)patch.photo_url=String(src.photo_url||"").trim();
        patches.push({index,patch});
      }
      const {data,error}=await admin.rpc("elleng_patch_players_atomic",{p_draft_id:draftId,p_patches:patches});
      if(error) throw error;
      return json({ok:true,state:data});
    }

    if(action==="update_registered_name"){
      const index=Number(body?.golfer_index);
      const name=String(body?.display_name||"").trim().replace(/\\s+/g," ");
      if(!Number.isInteger(index)||index<0) return json({error:"Invalid account index."},400);
      if(name.length<2||name.length>100) return json({error:"Enter a full name (2–100 characters)."},400);
      const {data:updated,error}=await admin.from("elleng_player_accounts").update({display_name:name,updated_at:new Date().toISOString()}).eq("draft_id",draftId).eq("golfer_index",index).select("golfer_index").maybeSingle();
      if(error)throw error;
      if(!updated)return json({error:"Registered account not found."},404);
      return json({ok:true,display_name:name});
    }

    if(action==="update_registered_photo"){
      const index=Number(body?.golfer_index);
      const photoUrl=String(body?.photo_url||"").trim();
      if(!Number.isInteger(index)||index<0) return json({error:"Invalid account index."},400);
      if(photoUrl.length>2048||!/^https:\/\//i.test(photoUrl)) return json({error:"A valid HTTPS photo URL is required."},400);
      const {data:updated,error}=await admin.from("elleng_player_accounts").update({photo_url:photoUrl,updated_at:new Date().toISOString()}).eq("draft_id",draftId).eq("golfer_index",index).select("golfer_index").maybeSingle();
      if(error)throw error;
      if(!updated)return json({error:"Registered account not found."},404);
      return json({ok:true,photo_url:photoUrl});
    }

    if(action==="reset_registered_password"){
      const index=Number(body?.golfer_index);
      const password=String(body?.password||"");
      if(!Number.isInteger(index)||index<0) return json({error:"Invalid account index."},400);
      if(password.length<6) return json({error:"Password must be at least 6 characters."},400);
      const {data:account,error:accountError}=await admin.from("elleng_player_accounts").select("user_id,username").eq("draft_id",draftId).eq("golfer_index",index).maybeSingle();
      if(accountError) throw accountError;
      if(!account?.user_id) return json({error:"Registered account not found."},404);
      const {error:resetError}=await admin.auth.admin.updateUserById(account.user_id,{password});
      if(resetError) throw resetError;
      const {error:flagError}=await admin.from("elleng_player_accounts").update({must_change_password:true,updated_at:new Date().toISOString()}).eq("draft_id",draftId).eq("golfer_index",index).eq("user_id",account.user_id);
      if(flagError) throw flagError;
      return json({ok:true,username:account.username,must_change_password:true});
    }

    const golferIndex=Number(body?.golfer_index);
    if(!Number.isInteger(golferIndex)||golferIndex<0||!golfers[golferIndex]||!String(golfers[golferIndex].name||"").trim()) return json({error:"Choose a valid golfer."},400);
    const golfer=golfers[golferIndex];

    if(action==="unlink"){
      const {error}=await admin.from("elleng_player_accounts").delete().eq("draft_id",draftId).eq("golfer_index",golferIndex);
      if(error) throw error;
      return json({ok:true,message:"Player login link removed. The Auth user account was not deleted."});
    }

    const username=clean(body?.username);
    const password=String(body?.password||"");
    if(username.length<2) return json({error:"Username must be at least 2 letters or numbers."},400);
    if(password.length<6) return json({error:"Password must be at least 6 characters."},400);
    const {data:clash,error:clashError}=await admin.from("elleng_player_accounts").select("golfer_index").eq("draft_id",draftId).eq("username",username).maybeSingle();
    if(clashError) throw clashError;
    if(clash&&Number(clash.golfer_index)!==golferIndex) return json({error:"That username is already being used."},409);

    const email=`${username}${DOMAIN}`;
    let authUser:any=null;
    for(let page=1;page<=10&&!authUser;page++){
      const {data,error}=await admin.auth.admin.listUsers({page,perPage:1000});
      if(error) throw error;
      authUser=data.users.find((u:any)=>norm(u.email)===email)||null;
      if(data.users.length<1000) break;
    }
    if(authUser){
      const {data,error}=await admin.auth.admin.updateUserById(authUser.id,{password,email_confirm:true});
      if(error) throw error;
      authUser=data.user;
    }else{
      const {data,error}=await admin.auth.admin.createUser({email,password,email_confirm:true});
      if(error) throw error;
      authUser=data.user;
    }

    const {error:upsertError}=await admin.from("elleng_player_accounts").upsert({draft_id:draftId,golfer_index:golferIndex,user_id:authUser.id,email,username,must_change_password:true,updated_at:new Date().toISOString()},{onConflict:"draft_id,golfer_index"});
    if(upsertError) throw upsertError;
    return json({ok:true,username,user_id:authUser.id,golfer_name:String(golfer.name||""),must_change_password:true,message:"Player login is ready."});
  }catch(e){
    console.error(e);
    return json({error:e instanceof Error?e.message:"Unexpected error."},400);
  }
});