-- Etapa del embudo para cada idea de marketing: tofu (descubrimiento), mofu (nutrición), bofu (empujón a la reunión).
alter table marketing_ideas add column if not exists funnel text
  check (funnel in ('tofu','mofu','bofu'));
comment on column marketing_ideas.funnel is 'Etapa del embudo: tofu (descubrimiento), mofu (nutrición), bofu (empujón a la reunión).';
