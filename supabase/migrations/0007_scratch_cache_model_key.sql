-- scratch_cache: add a `model` column and widen the primary key to
-- (image_hash, model). Previously the cache was keyed on image_hash alone,
-- so re-processing the same image with a different model would return the
-- previous model's cached result instead of running the new model.
--
-- Existing rows predate per-request model selection and were all produced
-- with the default model, so backfill them with 'claude-opus-4-8' via the
-- not-null default before changing the primary key.

alter table public.scratch_cache
  add column model text not null default 'claude-opus-4-8';

alter table public.scratch_cache
  drop constraint scratch_cache_pkey;

alter table public.scratch_cache
  add primary key (image_hash, model);
