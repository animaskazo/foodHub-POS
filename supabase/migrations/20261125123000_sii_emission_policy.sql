-- Configuration only. No trigger or worker emits tax documents in this stage.
alter table public.sii_issuer_profiles
  add column emission_channels text[] not null default '{}'
    check (emission_channels <@ array['pos', 'online', 'whatsapp']::text[]
      and array_position(emission_channels, null) is null and cardinality(emission_channels) <= 3),
  add column emission_model text not null default 'unconfirmed'
    check (emission_model in ('unconfirmed', 'always_receipt', 'voucher_replaces_receipt')),
  add column terminal_document text not null default 'unconfirmed'
    check (terminal_document in ('unconfirmed', 'voucher', 'foodhub')),
  add column online_document text not null default 'unconfirmed'
    check (online_document in ('unconfirmed', 'voucher', 'foodhub'));

comment on column public.sii_issuer_profiles.emission_model is
  'Business-declared copy of SII model. Saving here does not change the SII registration or enable production.';
comment on column public.sii_issuer_profiles.terminal_document is
  'Declared coverage of terminal card payments, to be verified with operator before live activation.';
comment on column public.sii_issuer_profiles.online_document is
  'Declared coverage of gateway payments; online channel alone does not imply absence of a tax-valid voucher.';
