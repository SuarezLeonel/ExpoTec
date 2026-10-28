// Defaults for the imported menu; custom families are configured in the catalog.
const families: [string, string, RegExp][] = [
  [
    'Cafetería',
    'Café',
    /^(?:Café (en pocillo|en jarrito|con leche Baguette|con leche|doble con crema|doble|con crema)|(Ristretto|Descafeinado))$/,
  ],
  ['Cafés artesanales', 'Cappuccino', /^Cappuccino(?: (.+))?$/],
  ['Cafés artesanales', 'Café especial', /^Café (.+)$/],
  ['Tés', 'Té', /^Té (.+)$/],
  ['Jugos y limonadas', 'Jugo exprimido', /^Jugo exprimido (.+)$/],
  ['Licuados frutales', 'Licuado', /^Licuado (.+)$/],
  ['Frutas y yogures', 'Yogur', /^Yogur(?: (.+))?$/],
  ['Panadería y pastelería', 'Scones', /^Scones(?: (.+))?$/],
  ['Desayunos keto', 'Desayuno keto', /^Keto (.+)$/],
  ['Tostones y omelettes', 'Tostón', /^Tostón de (.+)$/],
  ['Tostones y omelettes', 'Omelette', /^Omelette de (.+)$/],
  ['Frappuccinos', 'Frappuccino', /^Frappuccino(?: (.+))?$/],
  ['Smoothies', 'Smoothie', /^Smoothie de (.+)$/],
  ['Milkshakes', 'Milkshake', /^Milkshake de (.+)$/],
  ['Hamburguesas', 'Hamburguesa', /^Hamburguesa (.+)$/],
  ['Menús', 'Menú del día', /^Menú del día (.+)$/],
  ['Sándwiches especiales', 'Wrap César', /^Wrap César (.+)$/],
  ['Ensaladas', 'César', /^César (.+)$/],
  ['Lomitos', 'Lomito', /^Lomito (.+)$/],
  ['Tartas', 'Tarta', /^Tarta (?:de )?(.+)$/],
  ['Minutas', 'Milanesa', /^Milanesa (.+)$/],
  ['Minutas', 'Suprema', /^Suprema (.+)$/],
  ['Pechugas', 'Pechuga', /^Pechuga (.+)$/],
  ['Bebidas', 'Agua', /^Agua(?: (.+))?$/],
  ['Cervezas', 'Stella Artois', /^Stella Artois (.+)$/],
];

export function defaultVariation(category: string, name: string) {
  if (category === 'Pizzas') {
    const pizza = /^(Pizza .+) (chica|grande)$/.exec(name);
    if (pizza) return { variant_group: pizza[1], variant_name: capitalize(pizza[2]) };
  }
  for (const [categoryName, group, pattern] of families) {
    if (category !== categoryName) continue;
    const match = pattern.exec(name);
    if (!match) continue;
    const label = match.slice(1).find(Boolean) || (group === 'Agua' ? 'Sin gas' : 'Clásico');
    return { variant_group: group, variant_name: capitalize(label) };
  }
  return { variant_group: '', variant_name: '' };
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
