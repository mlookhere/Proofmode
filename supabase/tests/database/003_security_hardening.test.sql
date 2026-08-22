begin;

create extension if not exists pgtap with schema extensions;
select plan(8);

select is(
  (select count(*)::int from public.challenge_templates),
  60,
  'the canonical launch library contains exactly 60 templates'
);

select ok(
  to_regprocedure('private.is_challenge_member(uuid)') is not null,
  'challenge membership helper lives in the private schema'
);

select ok(
  to_regprocedure('public.is_challenge_member(uuid)') is null,
  'challenge membership helper is not exposed as a public RPC'
);

select ok(
  to_regprocedure('public.join_public_challenge(text)') is null,
  'legacy join RPC has been removed'
);

select ok(
  has_function_privilege('anon', 'public.get_feed_v1(integer,numeric,timestamp with time zone,uuid)', 'EXECUTE'),
  'anonymous users can execute the public feed RPC'
);

select ok(
  has_function_privilege('authenticated', 'public.join_challenge_v2(text,text)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.join_challenge_v2(text,text)', 'EXECUTE'),
  'challenge join RPC is authenticated-only'
);

select ok(
  not has_function_privilege('authenticated', 'public.sync_stripe_subscription_event(text,text,text,text,uuid,text,text)', 'EXECUTE'),
  'clients cannot execute the billing synchronization RPC'
);

select ok(
  has_function_privilege('service_role', 'public.sync_stripe_subscription_event(text,text,text,text,uuid,text,text)', 'EXECUTE'),
  'service role can execute the billing synchronization RPC'
);

select * from finish();
rollback;
