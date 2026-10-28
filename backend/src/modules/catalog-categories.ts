const sections: Record<string, string> = {
  Cafetería: 'Cafetería',
  'Cafés artesanales': 'Cafetería',
  Tés: 'Cafetería',
  'Frutas y yogures': 'Desayunos',
  'Panadería y pastelería': 'Desayunos',
  'Desayunos y meriendas': 'Desayunos',
  'Desayunos keto': 'Desayunos',
  'Tostones y omelettes': 'Desayunos',
  'Tortas y tartas dulces': 'Dulces',
  'Sándwiches tostados': 'Cocina',
  Hamburguesas: 'Cocina',
  Guarniciones: 'Cocina',
  Menús: 'Cocina',
  'Sándwiches especiales': 'Cocina',
  Ensaladas: 'Cocina',
  Lomitos: 'Cocina',
  Tartas: 'Cocina',
  Minutas: 'Cocina',
  Pechugas: 'Cocina',
  Pizzas: 'Cocina',
  'Jugos y limonadas': 'Bebidas',
  'Licuados frutales': 'Bebidas',
  Frappuccinos: 'Bebidas',
  Smoothies: 'Bebidas',
  Milkshakes: 'Bebidas',
  Bebidas: 'Bebidas',
  Cervezas: 'Bebidas',
};

export function defaultCategory(name: string) {
  return {
    parent: sections[name],
    name: name === 'Cafetería' ? 'Cafés clásicos' : name === 'Bebidas' ? 'Aguas y gaseosas' : name,
  };
}
