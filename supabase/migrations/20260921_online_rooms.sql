-- Grid Duel online room schema. Applied to project xsrivyugohmiilcudamq.
create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z0-9]{6}$'),
  host_token uuid not null,
  guest_token uuid,
  state jsonb not null default '{"status":"waiting","hostBid":null,"guestBid":null,"round":1}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.rooms enable row level security;
revoke all on public.rooms from anon, authenticated;

-- Browser clients only access rooms through token-checked RPC functions.
-- The deployed functions create rooms, join rooms, read state, submit secret
-- bids, and let only the host publish resolved battle state.

create or replace function public.join_room(p_code text, p_guest_token uuid)
returns table(code text, state jsonb)
language plpgsql security definer set search_path = ''
as $$
begin
  update public.rooms r
  set guest_token = p_guest_token,
      state = jsonb_set(r.state, '{status}', '"playing"'),
      updated_at = now()
  where r.code = upper(p_code)
    and r.guest_token is null
    and r.host_token <> p_guest_token;
  return query select r.code, r.state from public.rooms r
    where r.code = upper(p_code) and r.guest_token = p_guest_token;
end $$;

create or replace function public.submit_room_bid(p_code text, p_token uuid, p_bid integer)
returns table(code text, state jsonb, updated_at timestamptz)
language plpgsql security definer set search_path = ''
as $$
declare room_row public.rooms; role_name text; safe_bid int;
begin
  select r.* into room_row from public.rooms r where r.code = upper(p_code) for update;
  if room_row.id is null or p_token not in (room_row.host_token, room_row.guest_token) then return; end if;
  role_name := case when p_token = room_row.host_token then 'hostBid' else 'guestBid' end;
  safe_bid := greatest(0, least(10, p_bid));
  update public.rooms r
    set state = jsonb_set(r.state, array[role_name], to_jsonb(safe_bid)), updated_at = now()
    where r.id = room_row.id;
  return query select r.code, r.state, r.updated_at from public.rooms r where r.id = room_row.id;
end $$;
