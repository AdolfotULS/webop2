-- ================================================================
--  schema.sql
--  Ejecuta esto en Supabase → SQL Editor antes de usar la app
-- ================================================================

create table if not exists eventos (
  id           bigserial primary key,
  session_id   text        not null,   -- ej: "d1-mediodia"
  session_label text       not null,   -- ej: "Día 1 · Mediodía"
  tipo         text        not null,   -- 'llegada' | 'inicio_atencion' | 'fin_atencion'
  t_server     bigint      not null,   -- Date.now() del servidor (ms)
  hora         text        not null,   -- 'HH:MM:SS' legible
  created_at   timestamptz not null default now()
);

-- índice para queries por sesión ordenadas por tiempo
create index if not exists idx_eventos_session on eventos(session_id, t_server asc);

-- Realtime: habilita la tabla para websockets
alter publication supabase_realtime add table eventos;

-- Función RPC: retorna timestamp del servidor en ms
-- Permite sincronizar el reloj entre los 3 celulares
create or replace function now_ms()
returns bigint language sql stable as $$
  select extract(epoch from now())::bigint * 1000;
$$;

-- RLS: sin autenticación (app de uso interno en red)
alter table eventos enable row level security;

create policy "allow_all" on eventos
  for all using (true) with check (true);
