do $$
declare
  v_edition_id uuid;
  v_source_discipline_id uuid;
  v_target_discipline record;
  v_source_group record;
  v_new_group_id uuid;
  v_team record;
begin

  -- 1. Obtener la edición activa (o draft)
  select id into v_edition_id
  from public.editions
  order by created_at desc
  limit 1;

  -- 2. Obtener la disciplina fuente: Fútbol Masculino
  select id into v_source_discipline_id
  from public.disciplines
  where edition_id = v_edition_id
    and name = 'football'
    and gender = 'M';

  -- 3. Para cada otra disciplina de la edición (excepto la fuente)
  for v_target_discipline in
    select id, name, gender
    from public.disciplines
    where edition_id = v_edition_id
      and id <> v_source_discipline_id
  loop

    -- 4. Para cada grupo de la disciplina fuente
    for v_source_group in
      select id, name
      from public.groups
      where edition_id = v_edition_id
        and discipline_id = v_source_discipline_id
    loop

      -- 5. Crear el grupo en la disciplina destino (si no existe ya)
      if not exists (
        select 1 from public.groups
        where edition_id = v_edition_id
          and discipline_id = v_target_discipline.id
          and name = v_source_group.name
      ) then

        insert into public.groups (edition_id, discipline_id, phase_id, name)
        select v_edition_id, v_target_discipline.id, phase_id, v_source_group.name
        from public.groups
        where id = v_source_group.id
        returning id into v_new_group_id;

        -- 6. Asignar los equipos del grupo original que participan en esta disciplina
        insert into public.group_teams (group_id, team_id, seed)
        select v_new_group_id, gt.team_id, gt.seed
        from public.group_teams gt
        where gt.group_id = v_source_group.id
          and exists (
            select 1 from public.team_disciplines td
            where td.team_id = gt.team_id
              and td.discipline_id = v_target_discipline.id
          );

        raise notice 'Grupo "%" creado para % %',
          v_source_group.name,
          v_target_discipline.name,
          v_target_discipline.gender;

      end if;

    end loop;
  end loop;

  raise notice 'Proceso completado para edición %', v_edition_id;
end;
$$;
