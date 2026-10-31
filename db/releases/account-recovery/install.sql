-- Separate verified recovery addresses: Auth username aliases remain unchanged.
begin;
create table public.elleng_recovery_emails (
 user_id uuid primary key references auth.users(id) on delete cascade,
 verified_email text unique,
 verified_at timestamptz,
 pending_email text,
 pending_hash text unique,
 pending_expires_at timestamptz,
 constraint recovery_pending_complete check ((pending_email is null and pending_hash is null and pending_expires_at is null) or (pending_email is not null and pending_hash is not null and pending_hash ~ '^[a-f0-9]{64}$' and pending_expires_at is not null))
);
create table public.elleng_recovery_limits (
 key_hash text primary key check(key_hash ~ '^[a-f0-9]{64}$'),
 attempts integer not null,
 expires_at timestamptz not null
);
alter table public.elleng_recovery_emails enable row level security;
alter table public.elleng_recovery_limits enable row level security;
revoke all on public.elleng_recovery_emails,public.elleng_recovery_limits from public,anon,authenticated;
grant select,insert,update,delete on public.elleng_recovery_emails,public.elleng_recovery_limits to service_role;

create function public.elleng_recovery_gate(p_key text,p_maximum integer,p_seconds integer) returns boolean
language plpgsql security invoker set search_path='' as $$
declare n integer;
begin
 if p_key !~ '^[a-f0-9]{64}$' or p_maximum not between 1 and 200 or p_seconds not between 60 and 86400 then raise exception 'Invalid limit';end if;
 delete from public.elleng_recovery_limits where expires_at<=now();
 insert into public.elleng_recovery_limits(key_hash,attempts,expires_at) values(p_key,1,now()+make_interval(secs=>p_seconds))
 on conflict(key_hash) do update set attempts=elleng_recovery_limits.attempts+1
 where elleng_recovery_limits.attempts<p_maximum returning attempts into n;
 return n is not null;
end $$;

create function public.elleng_recovery_pending(p_user uuid,p_email text,p_hash text) returns void
language plpgsql security invoker set search_path='' as $$
begin
 if p_hash !~ '^[a-f0-9]{64}$' or length(p_email)>254 or p_email is null then raise exception 'Invalid pending';end if;
 insert into public.elleng_recovery_emails(user_id,pending_email,pending_hash,pending_expires_at)
 values(p_user,p_email,p_hash,now()+interval '30 minutes')
 on conflict(user_id) do update set pending_email=excluded.pending_email,pending_hash=excluded.pending_hash,pending_expires_at=excluded.pending_expires_at;
end $$;

create function public.elleng_recovery_confirm(p_hash text) returns boolean
language plpgsql security invoker set search_path='' as $$
declare u uuid;
begin
 update public.elleng_recovery_emails set verified_email=pending_email,verified_at=now(),pending_email=null,pending_hash=null,pending_expires_at=null
 where pending_hash=p_hash and pending_expires_at>now() and exists(select 1 from public.elleng_player_accounts a where a.user_id=elleng_recovery_emails.user_id and a.draft_id='elleng-cup')
 returning user_id into u;
 return u is not null;
exception when unique_violation then return false;
end $$;
revoke all on function public.elleng_recovery_gate(text,integer,integer),public.elleng_recovery_pending(uuid,text,text),public.elleng_recovery_confirm(text) from public,anon,authenticated;
grant execute on function public.elleng_recovery_gate(text,integer,integer),public.elleng_recovery_pending(uuid,text,text),public.elleng_recovery_confirm(text) to service_role;
commit;
