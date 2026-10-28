ALTER TABLE dining_tables
  ADD COLUMN shape text NOT NULL DEFAULT 'round' CHECK(shape IN ('round','square','rectangular')),
  ADD COLUMN width integer NOT NULL DEFAULT 92 CHECK(width BETWEEN 40 AND 500),
  ADD COLUMN height integer NOT NULL DEFAULT 92 CHECK(height BETWEEN 40 AND 500),
  ADD COLUMN rotation integer NOT NULL DEFAULT 0 CHECK(rotation BETWEEN 0 AND 359);

ALTER TABLE dining_tables DROP CONSTRAINT dining_tables_x_check;
ALTER TABLE dining_tables DROP CONSTRAINT dining_tables_y_check;
ALTER TABLE dining_tables ADD CONSTRAINT dining_tables_x_check CHECK(x BETWEEN 0 AND 200000);
ALTER TABLE dining_tables ADD CONSTRAINT dining_tables_y_check CHECK(y BETWEEN 0 AND 200000);
CREATE TABLE floor_plan_state (
  id smallint PRIMARY KEY DEFAULT 1 CHECK(id=1),
  draft jsonb NOT NULL,
  published jsonb NOT NULL,
  version integer NOT NULL DEFAULT 1 CHECK(version>0),
  draft_revision integer NOT NULL DEFAULT 1 CHECK(draft_revision>0),
  updated_by uuid REFERENCES users(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO floor_plan_state(id,draft,published)
SELECT 1,
  jsonb_build_object(
    'tables',coalesce(jsonb_agg(jsonb_build_object(
    'id',id,'label',label,'capacity',capacity,'sector',sector,'x',x,'y',y,
      'shape',shape,'width',width,'height',height,'rotation',rotation,'active',active
    ) ORDER BY sector,label),'[]'::jsonb),
    'elements','[]'::jsonb
  ),
  jsonb_build_object(
    'tables',coalesce(jsonb_agg(jsonb_build_object(
      'id',id,'label',label,'capacity',capacity,'sector',sector,'x',x,'y',y,
      'shape',shape,'width',width,'height',height,'rotation',rotation,'active',active
    ) ORDER BY sector,label),'[]'::jsonb),
    'elements','[]'::jsonb
  )
FROM dining_tables
ON CONFLICT(id) DO NOTHING;
