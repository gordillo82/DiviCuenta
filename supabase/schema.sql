-- ============================================================
-- DiviCuenta – Supabase Schema
-- ============================================================
-- Ejecuta este archivo en el Editor SQL de tu proyecto Supabase:
--   https://app.supabase.com → SQL Editor → New query → pega y ejecuta

-- ─── Extensiones ─────────────────────────────────────────
create extension if not exists "pgcrypto";

-- ─── Tablas ───────────────────────────────────────────────

-- Sesiones de cuenta (cada mesa/grupo tiene una)
create table if not exists sessions (
  id          uuid primary key default gen_random_uuid(),
  code        text unique not null,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

-- Participantes registrados en la sesión
create table if not exists participants (
  id            uuid primary key default gen_random_uuid(),
  session_id    uuid not null references sessions(id) on delete cascade,
  nickname      text not null,
  connected_at  timestamptz default now(),
  last_seen_at  timestamptz default now()
);

-- Comensales (personas que van a pagar)
create table if not exists diners (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references sessions(id) on delete cascade,
  name        text not null,
  created_at  timestamptz default now()
);

-- Bebidas de la sesión (pueden ser de un solo comensal o compartidas)
create table if not exists drinks (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references sessions(id) on delete cascade,
  diner_id    uuid references diners(id) on delete cascade,  -- nullable para bebidas compartidas
  product     text not null,
  unit_price  numeric(10,2) not null default 0,
  quantity    integer not null default 1
);

-- Comida común (se reparte a partes iguales)
create table if not exists shared_food_items (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references sessions(id) on delete cascade,
  concept     text not null,
  price       numeric(10,2) not null default 0
);

-- Total del ticket (uno por sesión)
create table if not exists bills (
  session_id    uuid primary key references sessions(id) on delete cascade,
  total_amount  numeric(10,2) not null default 0,
  tax_total     numeric(10,2) not null default 0   -- IVA total del ticket
);

-- ─── Row Level Security ───────────────────────────────────
-- El modelo de seguridad se basa en el código de sesión de 6 caracteres:
-- solo quien conoce el código puede encontrar el session_id UUID.
-- Los UUIDs son criptográficamente difíciles de adivinar por fuerza bruta.

alter table sessions          enable row level security;
alter table participants      enable row level security;
alter table diners            enable row level security;
alter table drinks            enable row level security;
alter table shared_food_items enable row level security;
alter table bills             enable row level security;

-- Políticas: acceso anon permitido (protección por opacidad del UUID)
-- Para entornos de producción con mayor exigencia de seguridad,
-- considera añadir autenticación real (ver README).

create policy "anon_sessions"
  on sessions for all to anon
  using (true) with check (true);

create policy "anon_participants"
  on participants for all to anon
  using (true) with check (true);

create policy "anon_diners"
  on diners for all to anon
  using (true) with check (true);

create policy "anon_drinks"
  on drinks for all to anon
  using (true) with check (true);

create policy "anon_shared_food"
  on shared_food_items for all to anon
  using (true) with check (true);

create policy "anon_bills"
  on bills for all to anon
  using (true) with check (true);

-- ─── Índices para rendimiento ─────────────────────────────
create index if not exists idx_participants_session  on participants(session_id);
create index if not exists idx_diners_session        on diners(session_id);
create index if not exists idx_drinks_session        on drinks(session_id);
create index if not exists idx_drinks_diner          on drinks(diner_id);
create index if not exists idx_shared_food_session   on shared_food_items(session_id);

-- ============================================================
-- MIGRACIÓN: IVA por sesión
-- ============================================================
-- Ejecuta este bloque si ya tienes el schema anterior aplicado.
-- Añade el campo tax_total a la tabla bills (IVA total del ticket).
-- El valor por defecto es 0 para mantener compatibilidad con sesiones existentes.
alter table bills add column if not exists tax_total numeric(10,2) not null default 0;

-- ============================================================
-- MIGRACIÓN: Bebidas compartidas (Opción A – reparto igualitario)
-- ============================================================
-- Ejecuta este bloque en el SQL Editor de Supabase si ya tienes
-- el schema anterior aplicado. Si partes de cero, aplica todo
-- el archivo de una sola vez.

-- La columna diner_id de drinks pasa a ser opcional (nullable)
-- para poder crear bebidas asignadas a varios comensales a la vez.
alter table drinks alter column diner_id drop not null;

-- Tabla de relación N:M entre bebidas y comensales
-- Cada fila indica que un comensal participa en una bebida.
-- El coste de la bebida se divide a partes iguales entre todos
-- sus participantes (Opción A).
create table if not exists drink_participants (
  id          uuid primary key default gen_random_uuid(),
  drink_id    uuid not null references drinks(id) on delete cascade,
  diner_id    uuid not null references diners(id) on delete cascade,
  session_id  uuid not null references sessions(id) on delete cascade,
  unique (drink_id, diner_id)
);

alter table drink_participants enable row level security;

create policy "anon_drink_participants"
  on drink_participants for all to anon
  using (true) with check (true);

create index if not exists idx_drink_participants_drink   on drink_participants(drink_id);
create index if not exists idx_drink_participants_diner   on drink_participants(diner_id);
create index if not exists idx_drink_participants_session on drink_participants(session_id);
