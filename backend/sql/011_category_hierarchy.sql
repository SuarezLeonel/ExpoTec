ALTER TABLE categories ADD COLUMN parent_id uuid REFERENCES categories(id);
ALTER TABLE categories ADD COLUMN sort_order integer NOT NULL DEFAULT 0 CHECK (sort_order BETWEEN 0 AND 9999);
ALTER TABLE categories ADD CONSTRAINT category_not_own_parent CHECK (parent_id IS NULL OR parent_id<>id);
CREATE INDEX categories_parent ON categories(parent_id);

-- Keep the original section IDs, products and order history when introducing parents.
UPDATE categories SET name='Cafés clásicos' WHERE name='Cafetería'
  AND NOT EXISTS(SELECT 1 FROM categories WHERE name='Cafés clásicos');
UPDATE categories SET name='Aguas y gaseosas' WHERE name='Bebidas'
  AND NOT EXISTS(SELECT 1 FROM categories WHERE name='Aguas y gaseosas');

INSERT INTO categories(id,name) VALUES
('11000000-0000-4000-8000-000000000001','Cafetería'),
('11000000-0000-4000-8000-000000000002','Desayunos'),
('10000000-0000-4000-8000-000000000002','Cocina'),
('10000000-0000-4000-8000-000000000003','Dulces'),
('11000000-0000-4000-8000-000000000005','Bebidas')
ON CONFLICT(name) DO NOTHING;

UPDATE categories SET sort_order=CASE name WHEN 'Cafetería' THEN 10 WHEN 'Desayunos' THEN 20
  WHEN 'Cocina' THEN 30 WHEN 'Dulces' THEN 40 WHEN 'Bebidas' THEN 50 END
WHERE name IN ('Cafetería','Desayunos','Cocina','Dulces','Bebidas');

WITH sections(name,parent) AS (VALUES
('Cafés clásicos','Cafetería'),('Cafés artesanales','Cafetería'),('Tés','Cafetería'),
('Frutas y yogures','Desayunos'),('Panadería y pastelería','Desayunos'),
('Desayunos y meriendas','Desayunos'),('Desayunos keto','Desayunos'),('Tostones y omelettes','Desayunos'),
('Tortas y tartas dulces','Dulces'),
('Sándwiches tostados','Cocina'),('Hamburguesas','Cocina'),('Guarniciones','Cocina'),
('Menús','Cocina'),('Sándwiches especiales','Cocina'),('Ensaladas','Cocina'),
('Lomitos','Cocina'),('Tartas','Cocina'),('Minutas','Cocina'),('Pechugas','Cocina'),('Pizzas','Cocina'),
('Jugos y limonadas','Bebidas'),('Licuados frutales','Bebidas'),('Frappuccinos','Bebidas'),
('Smoothies','Bebidas'),('Milkshakes','Bebidas'),('Aguas y gaseosas','Bebidas'),('Cervezas','Bebidas'))
UPDATE categories c SET parent_id=p.id FROM sections s,categories p
WHERE c.name=s.name AND p.name=s.parent AND c.parent_id IS NULL;

UPDATE categories p SET active=true WHERE EXISTS(
  SELECT 1 FROM categories c WHERE c.parent_id=p.id AND c.active
);

CREATE FUNCTION check_category_depth() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.parent_id IS NOT NULL AND (
    EXISTS(SELECT 1 FROM categories WHERE id=NEW.parent_id AND parent_id IS NOT NULL)
    OR EXISTS(SELECT 1 FROM categories WHERE parent_id=NEW.id)
  ) THEN
    RAISE EXCEPTION 'Las categorías admiten un solo nivel de subcategorías.' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER category_depth BEFORE INSERT OR UPDATE OF parent_id ON categories
FOR EACH ROW EXECUTE FUNCTION check_category_depth();
