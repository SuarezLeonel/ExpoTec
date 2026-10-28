INSERT INTO roles(name) VALUES ('admin'),('cashier'),('waiter'),('kitchen'),('bar') ON CONFLICT DO NOTHING;
INSERT INTO permissions(name) VALUES ('operate'),('prepare_kitchen'),('prepare_bar'),('cash'),('discount'),('refund'),('sensitive_void'),('manage_catalog'),('manage_tables'),('manage_users'),('audit'),('settings') ON CONFLICT DO NOTHING;
INSERT INTO role_permissions SELECT 'admin',name FROM permissions ON CONFLICT DO NOTHING;
INSERT INTO role_permissions(role,permission) VALUES ('cashier','operate'),('cashier','cash'),('cashier','discount'),('cashier','refund'),('cashier','sensitive_void'),('waiter','operate'),('kitchen','prepare_kitchen'),('bar','prepare_bar') ON CONFLICT DO NOTHING;
INSERT INTO categories(id,name,sort_order) VALUES
('11000000-0000-4000-8000-000000000001','Cafetería',10),('11000000-0000-4000-8000-000000000002','Desayunos',20),
('10000000-0000-4000-8000-000000000002','Cocina',30),('10000000-0000-4000-8000-000000000003','Dulces',40),
('11000000-0000-4000-8000-000000000005','Bebidas',50) ON CONFLICT DO NOTHING;
INSERT INTO categories(id,name,parent_id) VALUES
('10000000-0000-4000-8000-000000000001','Cafés clásicos','11000000-0000-4000-8000-000000000001'),
('10000000-0000-4000-8000-000000000004','Aguas y gaseosas','11000000-0000-4000-8000-000000000005') ON CONFLICT DO NOTHING;
INSERT INTO addons(id,name,price_cents) VALUES ('20000000-0000-4000-8000-000000000001','Leche vegetal',80000),('20000000-0000-4000-8000-000000000002','Extra queso',100000),('20000000-0000-4000-8000-000000000003','Extra huevo',120000) ON CONFLICT DO NOTHING;
INSERT INTO products(id,category_id,name,description,price_cents,destination,available,active,visible_en_carta,variant_group,variant_name) VALUES
('30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','Café con leche','Ejemplo ficticio. Café y leche.',350000,'bar',true,true,true,'Café','Con leche'),
('30000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002','Tostado de jamón y queso','Ejemplo ficticio. Pan tostado con jamón y queso.',650000,'kitchen',true,true,true,'',''),
('30000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000003','Medialuna','Ejemplo ficticio. Pieza de pastelería.',180000,'none',true,true,true,'',''),
('30000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000004','Limonada','Ejemplo ficticio. Limonada fresca.',400000,'bar',true,true,true,'',''),
('30000000-0000-4000-8000-000000000005','10000000-0000-4000-8000-000000000002','Sándwich especial','Ejemplo no disponible, visible en carta.',850000,'kitchen',false,true,true,'',''),
('30000000-0000-4000-8000-000000000006','10000000-0000-4000-8000-000000000001','Café interno','Producto oculto de la carta pública.',200000,'bar',true,true,false,'','') ON CONFLICT DO NOTHING;
INSERT INTO product_addons(product_id,addon_id) VALUES ('30000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001'),('30000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002'),('30000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000003') ON CONFLICT DO NOTHING;
INSERT INTO dining_tables(id,label,capacity,sector,x,y) VALUES
('40000000-0000-4000-8000-000000000001','1',2,'Salón',40,40),('40000000-0000-4000-8000-000000000002','2',4,'Salón',200,40),('40000000-0000-4000-8000-000000000003','3',4,'Salón',360,40),('40000000-0000-4000-8000-000000000004','4',2,'Salón',40,200),('40000000-0000-4000-8000-000000000005','5',6,'Patio',200,200),('40000000-0000-4000-8000-000000000006','6',4,'Patio',360,200) ON CONFLICT DO NOTHING;

