UPDATE dining_tables AS table_row
SET x=coordinates.new_x,y=coordinates.new_y,updated_at=now()
FROM (VALUES
  ('40000000-0000-4000-8000-000000000001'::uuid,3240,3240,40,40),
  ('40000000-0000-4000-8000-000000000002'::uuid,16040,3240,200,40),
  ('40000000-0000-4000-8000-000000000003'::uuid,28840,3240,360,40),
  ('40000000-0000-4000-8000-000000000004'::uuid,3240,16040,40,200),
  ('40000000-0000-4000-8000-000000000005'::uuid,16040,16040,200,200),
  ('40000000-0000-4000-8000-000000000006'::uuid,28840,16040,360,200)
) AS coordinates(id,old_x,old_y,new_x,new_y)
WHERE table_row.id=coordinates.id
  AND table_row.x=coordinates.old_x
  AND table_row.y=coordinates.old_y;

UPDATE floor_plan_state AS plan
SET draft=jsonb_set(
      plan.draft,
      '{tables}',
      COALESCE((
        SELECT jsonb_agg(
          CASE WHEN coordinates.id IS NOT NULL
            THEN entry.value || jsonb_build_object('x',coordinates.new_x,'y',coordinates.new_y)
            ELSE entry.value
          END ORDER BY entry.ordinality
        )
        FROM jsonb_array_elements(plan.draft->'tables') WITH ORDINALITY AS entry(value,ordinality)
        LEFT JOIN (VALUES
          ('40000000-0000-4000-8000-000000000001',3240,3240,40,40),
          ('40000000-0000-4000-8000-000000000002',16040,3240,200,40),
          ('40000000-0000-4000-8000-000000000003',28840,3240,360,40),
          ('40000000-0000-4000-8000-000000000004',3240,16040,40,200),
          ('40000000-0000-4000-8000-000000000005',16040,16040,200,200),
          ('40000000-0000-4000-8000-000000000006',28840,16040,360,200)
        ) AS coordinates(id,old_x,old_y,new_x,new_y)
          ON entry.value->>'id'=coordinates.id
          AND (entry.value->>'x')::integer=coordinates.old_x
          AND (entry.value->>'y')::integer=coordinates.old_y
      ),'[]'::jsonb)
    ),
    published=jsonb_set(
      plan.published,
      '{tables}',
      COALESCE((
        SELECT jsonb_agg(
          CASE WHEN coordinates.id IS NOT NULL
            THEN entry.value || jsonb_build_object('x',coordinates.new_x,'y',coordinates.new_y)
            ELSE entry.value
          END ORDER BY entry.ordinality
        )
        FROM jsonb_array_elements(plan.published->'tables') WITH ORDINALITY AS entry(value,ordinality)
        LEFT JOIN (VALUES
          ('40000000-0000-4000-8000-000000000001',3240,3240,40,40),
          ('40000000-0000-4000-8000-000000000002',16040,3240,200,40),
          ('40000000-0000-4000-8000-000000000003',28840,3240,360,40),
          ('40000000-0000-4000-8000-000000000004',3240,16040,40,200),
          ('40000000-0000-4000-8000-000000000005',16040,16040,200,200),
          ('40000000-0000-4000-8000-000000000006',28840,16040,360,200)
        ) AS coordinates(id,old_x,old_y,new_x,new_y)
          ON entry.value->>'id'=coordinates.id
          AND (entry.value->>'x')::integer=coordinates.old_x
          AND (entry.value->>'y')::integer=coordinates.old_y
      ),'[]'::jsonb)
    ),
    version=version+1,
    draft_revision=draft_revision+1,
    updated_at=now()
WHERE plan.id=1
  AND (
    EXISTS (
      SELECT 1
      FROM jsonb_array_elements(plan.draft->'tables') AS entry(value)
      JOIN (VALUES
        ('40000000-0000-4000-8000-000000000001',3240,3240),
        ('40000000-0000-4000-8000-000000000002',16040,3240),
        ('40000000-0000-4000-8000-000000000003',28840,3240),
        ('40000000-0000-4000-8000-000000000004',3240,16040),
        ('40000000-0000-4000-8000-000000000005',16040,16040),
        ('40000000-0000-4000-8000-000000000006',28840,16040)
      ) AS coordinates(id,x,y)
        ON entry.value->>'id'=coordinates.id
        AND (entry.value->>'x')::integer=coordinates.x
        AND (entry.value->>'y')::integer=coordinates.y
    )
    OR EXISTS (
      SELECT 1
      FROM jsonb_array_elements(plan.published->'tables') AS entry(value)
      JOIN (VALUES
        ('40000000-0000-4000-8000-000000000001',3240,3240),
        ('40000000-0000-4000-8000-000000000002',16040,3240),
        ('40000000-0000-4000-8000-000000000003',28840,3240),
        ('40000000-0000-4000-8000-000000000004',3240,16040),
        ('40000000-0000-4000-8000-000000000005',16040,16040),
        ('40000000-0000-4000-8000-000000000006',28840,16040)
      ) AS coordinates(id,x,y)
        ON entry.value->>'id'=coordinates.id
        AND (entry.value->>'x')::integer=coordinates.x
        AND (entry.value->>'y')::integer=coordinates.y
    )
  );
