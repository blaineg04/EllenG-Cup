CREATE ROLE service_role NOLOGIN;
CREATE TABLE public.elleng_player_accounts(draft_id text,golfer_index integer,user_id uuid,PRIMARY KEY(draft_id,golfer_index),UNIQUE(draft_id,user_id));
INSERT INTO public.elleng_drafts(id,owner_id,state)
SELECT 'player-test-'||f,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',jsonb_build_object(
 'playFormat',f,'teams',jsonb_build_array(jsonb_build_object('name','Team 1','roster',jsonb_build_array(0,1,2,3)),jsonb_build_object('name','Team 2','roster',jsonb_build_array(4,5,6,7))),
 'golfers',(SELECT jsonb_agg(jsonb_build_object('name','Synthetic '||i,'team',i/4) ORDER BY i) FROM generate_series(0,7)i))
FROM (VALUES('standard'),('split_pair'))formats(f);
INSERT INTO public.elleng_tournaments VALUES('player-standard','player-test-standard','setup',2),('player-split','player-test-split_pair','setup',2);
INSERT INTO public.elleng_player_accounts SELECT 'player-test-'||f,0,'11111111-1111-4111-8111-111111111111' FROM (VALUES('standard'),('split_pair'))formats(f);
INSERT INTO public.elleng_player_accounts SELECT 'player-test-'||f,2,'22222222-2222-4222-8222-222222222222' FROM (VALUES('standard'),('split_pair'))formats(f);
INSERT INTO public.elleng_captains VALUES('player-test-split_pair','cccccccc-cccc-4ccc-8ccc-cccccccccccc',0);
