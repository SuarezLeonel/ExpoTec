DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM floor_plan_state
    WHERE id=1 AND version=1 AND draft_revision=1 AND updated_by IS NULL
  ) AND EXISTS (
    SELECT 1 FROM dining_tables WHERE x>2000 OR y>2000
  ) THEN
    UPDATE dining_tables
    SET x=(x-40)/80,y=(y-40)/80
    WHERE x>=40 AND y>=40;

    UPDATE floor_plan_state
    SET draft=jsonb_set(
          draft,
          '{tables}',
          COALESCE((
            SELECT jsonb_agg(
              entry.value || jsonb_build_object(
                'x',((entry.value->>'x')::integer-40)/80,
                'y',((entry.value->>'y')::integer-40)/80
              ) ORDER BY entry.ordinality
            )
            FROM jsonb_array_elements(draft->'tables') WITH ORDINALITY AS entry(value,ordinality)
          ),'[]'::jsonb)
        ),
        published=jsonb_set(
          published,
          '{tables}',
          COALESCE((
            SELECT jsonb_agg(
              entry.value || jsonb_build_object(
                'x',((entry.value->>'x')::integer-40)/80,
                'y',((entry.value->>'y')::integer-40)/80
              ) ORDER BY entry.ordinality
            )
            FROM jsonb_array_elements(published->'tables') WITH ORDINALITY AS entry(value,ordinality)
          ),'[]'::jsonb)
        ),
        updated_at=now()
    WHERE id=1;
  END IF;
END
$$;
