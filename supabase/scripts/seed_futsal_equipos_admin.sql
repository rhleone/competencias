-- =============================================================
-- Seed: 11 equipos de áreas administrativas universitarias
-- Disciplina: Fútbol Sala (futsal)
-- =============================================================
-- Uso:
--   1. Editar v_edition_name si el nombre de la edición es distinto.
--   2. Editar v_gender ('M' o 'F') según corresponda.
--   3. Ejecutar en el SQL Editor de Supabase.
-- =============================================================

do $$
declare
  v_edition_id    uuid;
  v_discipline_id uuid;
  v_team_id       uuid;

  -- ── Configuración ────────────────────────────────────────────
  v_edition_name    text := 'Olimpiadas 2025';  -- ajustar si cambia
  v_discipline_name text := 'futsal';
  v_gender          text := 'M';               -- 'M' o 'F'
  -- ─────────────────────────────────────────────────────────────

  v_nombres text[] := array[
    'Contabilidad',
    'Recursos Humanos',
    'Títulos y Grados',
    'Registro Académico',
    'Tesorería',
    'Rectoría',
    'Vicerrectoría',
    'Bienestar Universitario',
    'Secretaría General',
    'Planificación',
    'Informática'
  ];

  v_colores text[] := array[
    '#1D4ED8',
    '#15803D',
    '#B45309',
    '#7C3AED',
    '#0E7490',
    '#B91C1C',
    '#C2410C',
    '#065F46',
    '#1E40AF',
    '#6B21A8',
    '#0F766E'
  ];

  v_nombre text;
  v_color  text;
  i        int;

begin
  -- 1. Obtener la edición
  select id into v_edition_id
  from public.editions
  where name = v_edition_name
  limit 1;

  if v_edition_id is null then
    raise exception 'No se encontró la edición "%". Verifica v_edition_name.', v_edition_name;
  end if;

  -- 2. Obtener la disciplina futsal
  select id into v_discipline_id
  from public.disciplines
  where edition_id = v_edition_id
    and name       = v_discipline_name
    and gender     = v_gender
  limit 1;

  if v_discipline_id is null then
    raise exception 'No se encontró la disciplina "%" (%) en la edición "%". Crea la disciplina primero.',
      v_discipline_name, v_gender, v_edition_name;
  end if;

  raise notice 'Edición   : % (%)', v_edition_name, v_edition_id;
  raise notice 'Disciplina: % % (%)', v_discipline_name, v_gender, v_discipline_id;
  raise notice '-------------------------------------------';

  -- 3. Insertar equipos y vincularlos a la disciplina
  for i in 1 .. array_length(v_nombres, 1) loop
    v_nombre := v_nombres[i];
    v_color  := v_colores[i];

    -- Evitar duplicados si el script se ejecuta más de una vez
    select id into v_team_id
    from public.teams
    where edition_id = v_edition_id
      and name       = v_nombre
    limit 1;

    if v_team_id is null then
      insert into public.teams (edition_id, name, color)
      values (v_edition_id, v_nombre, v_color)
      returning id into v_team_id;

      raise notice 'Equipo creado   : %  (%)', v_nombre, v_color;
    else
      raise notice 'Ya existe (skip): %', v_nombre;
    end if;

    -- Vincular al futsal (ignorar si el vínculo ya existe)
    insert into public.team_disciplines (team_id, discipline_id)
    values (v_team_id, v_discipline_id)
    on conflict (team_id, discipline_id) do nothing;

  end loop;

  raise notice '-------------------------------------------';
  raise notice '11 equipos procesados correctamente.';
end;
$$;
