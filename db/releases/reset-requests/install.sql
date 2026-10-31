begin;
create table public.elleng_reset_requests(
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 username text not null,
 created_at timestamptz not null default now(),
 status text not null default 'pending' check(status in('pending','processing','resolved','dismissed')),
 claim_token uuid,claimed_at timestamptz,closed_at timestamptz,
 push_state text not null default 'queued' check(push_state in('queued','accepted','unavailable','failed'))
);
create unique index elleng_one_open_reset on public.elleng_reset_requests(user_id) where status in('pending','processing');
create table public.elleng_reset_push_keys(id integer primary key check(id=1),public_key text not null,private_key text not null);
create table public.elleng_reset_push_devices(
 endpoint text primary key,owner_id uuid not null references auth.users(id) on delete cascade,
 subscription jsonb not null,updated_at timestamptz not null default now()
);
alter table public.elleng_reset_requests enable row level security;
alter table public.elleng_reset_push_keys enable row level security;
alter table public.elleng_reset_push_devices enable row level security;
revoke all on public.elleng_reset_requests,public.elleng_reset_push_keys,public.elleng_reset_push_devices from public,anon,authenticated;
grant select,insert,update,delete on public.elleng_reset_requests,public.elleng_reset_push_keys,public.elleng_reset_push_devices to service_role;

create function public.elleng_queue_reset_request(p_user uuid,p_username text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare request_id uuid;
begin
 if not exists(select 1 from public.elleng_player_accounts where draft_id='elleng-cup' and user_id=p_user and username=p_username) then return null;end if;
 delete from public.elleng_reset_requests where status in('resolved','dismissed') and closed_at<now()-interval '90 days';
 insert into public.elleng_reset_requests(user_id,username) values(p_user,p_username)
 on conflict(user_id) where status in('pending','processing') do nothing returning id into request_id;
 if request_id is not null then return jsonb_build_object('id',request_id,'fresh',true);end if;
 select id into request_id from public.elleng_reset_requests where user_id=p_user and status in('pending','processing');
 return jsonb_build_object('id',request_id,'fresh',false);
end $$;

create function public.elleng_claim_reset_request(p_id uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare item public.elleng_reset_requests;
begin
 update public.elleng_reset_requests set status='processing',claimed_at=now(),claim_token=gen_random_uuid()
 where id=p_id and (status='pending' or (status='processing' and claimed_at<now()-interval '5 minutes'))
 returning * into item;
 if item.id is null then return null;end if;
 return to_jsonb(item);
end $$;

create function public.elleng_save_reset_push_device(p_owner uuid,p_subscription jsonb) returns void
language plpgsql security invoker set search_path='' as $$
begin
 perform pg_advisory_xact_lock(hashtextextended('elleng-reset-push-devices',0));
 if not exists(select 1 from public.elleng_drafts where id='elleng-cup' and owner_id=p_owner) then raise exception 'Owner required';end if;
 if not exists(select 1 from public.elleng_reset_push_devices where endpoint=p_subscription->>'endpoint' and owner_id=p_owner)
 and (select count(*) from public.elleng_reset_push_devices where owner_id=p_owner)>=10 then raise exception 'Device limit reached';end if;
 insert into public.elleng_reset_push_devices(endpoint,owner_id,subscription) values(p_subscription->>'endpoint',p_owner,p_subscription)
 on conflict(endpoint) do update set subscription=excluded.subscription,updated_at=now() where elleng_reset_push_devices.owner_id=p_owner;
end $$;
revoke all on function public.elleng_queue_reset_request(uuid,text),public.elleng_claim_reset_request(uuid),public.elleng_save_reset_push_device(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.elleng_queue_reset_request(uuid,text),public.elleng_claim_reset_request(uuid),public.elleng_save_reset_push_device(uuid,jsonb) to service_role;
commit;
