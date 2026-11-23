-- Disposable PostgreSQL fixture only; never run against production.
create extension if not exists pgcrypto;
create schema if not exists auth;
create table auth.users(id uuid primary key);
create or replace function auth.uid() returns uuid language sql stable as $$
 select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
$$;
create table public.elleng_drafts(id text primary key,owner_id uuid not null, state jsonb not null default '{}'::jsonb);
create table public.elleng_tournaments(id text primary key,state jsonb not null default '{}'::jsonb);
insert into auth.users(id) values
 ('11111111-1111-4111-8111-111111111111'),
 ('22222222-2222-4222-8222-222222222222');
insert into public.elleng_drafts(id,owner_id,state) values
 ('elleng-cup','11111111-1111-4111-8111-111111111111','{"picks":[1],"completed":true}');
insert into public.elleng_tournaments(id,state) values
 ('elleng-cup-live','{"status":"completed","scores":[3,4]}');
