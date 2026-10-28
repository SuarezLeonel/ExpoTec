# Identidad visual: observación y propuesta

Consulta: 18 de octubre de 2026. Fuente primaria: [sitio oficial Baguette](https://baguette.com.ar/). Inspección real con navegador Brave, escritorio y viewport 390 × 844. También se leyó HTML y CSS oficial. Chrome DevTools no pudo iniciar por ausencia de Chrome; la inspección se realizó con el navegador disponible.

## Recursos verificados

| Elemento        | Observado en fuente oficial                                                                                                                                                                                                                        | Uso en la demo                                                                                                     |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Logo            | [SVG original](https://baguette.com.ar/wp-content/uploads/2026/07/baguette-logo.svg), proporción intrínseca 208 × 79, símbolo y logotipo blancos                                                                                                   | Archivo original sin modificar en `/brand/baguette-logo.svg`, siempre sobre azul; ancho flexible y alto automático |
| Variante social | HTML JSON-LD referencia [baguette-social.jpg](https://baguette.com.ar/wp-content/uploads/2026/07/baguette-social.jpg), 512 × 513                                                                                                                   | Recurso identificado en código, no empleado ni validado visualmente como variante alternativa                      |
| Azul            | `#2B5369`, variable secondary del [CSS global](https://baguette.com.ar/wp-content/uploads/elementor/css/post-5.css?ver=1791478833) y cabecera computada                                                                                            | Navegación y acciones                                                                                              |
| Azul de texto   | `#183849`, variable text y texto computado                                                                                                                                                                                                         | Texto principal claro                                                                                              |
| Dorado          | `#D2B677`, primary y fondo computado del botón de carta                                                                                                                                                                                            | Acento, con texto oscuro                                                                                           |
| Terracota       | `#CB9374`, accent del CSS global                                                                                                                                                                                                                   | Acento secundario propuesto                                                                                        |
| Crema           | `#FDF7ED`, fondo computado en secciones                                                                                                                                                                                                            | Fondo inicial de la aplicación                                                                                     |
| Blanco          | `#FFFFFF`, CSS y logo                                                                                                                                                                                                                              | Superficies                                                                                                        |
| Inter           | CSS cargado desde [Google Fonts](https://fonts.googleapis.com/css?family=Inter:100,100italic,200,200italic,300,300italic,400,400italic,500,500italic,600,600italic,700,700italic,800,800italic,900,900italic&display=swap); cuerpo computado Inter | Sistema sans como alternativa offline si no se incluye Inter local                                                 |
| APOLLO          | H1/H2 computados APOLLO; `@font-face` del HTML apunta a [ap.ttf](https://baguette.com.ar/wp-content/uploads/2026/07/ap.ttf)                                                                                                                        | Archivo descargado sin alterar; serif de sistema como alternativa                                                  |
| BROLIMO         | Nombre declarado en tokens globales CSS, pero los títulos observados resuelven APOLLO                                                                                                                                                              | No afirmar que BROLIMO sea la tipografía efectivamente renderizada; no usada                                       |

Recursos descargados exclusivamente del dominio oficial. Su presencia pública no implica licencia de redistribución comercial: revisar permisos antes de publicar fuera de esta demo local.

## Composición y tono observados

Cabecera azul con logo blanco y navegación horizontal; hamburguesa móvil. Títulos de gran tamaño con serif, cuerpo sans, fondos crema/azul, botones redondeados con dorado, fotografías amplias de café, amasado y panificados. En móvil se apilan textos e imágenes y se mantiene una cabecera compacta. Lenguaje cercano con voseo argentino y referencias a rutina, elaboración propia y Mar del Plata.

Fotografías observadas: [portada](https://baguette.com.ar/wp-content/uploads/2026/07/baguette-portada-2.jpg), [alternativa](https://baguette.com.ar/wp-content/uploads/2026/07/baguette-portada-test.jpg), [proceso](https://baguette.com.ar/wp-content/uploads/2026/07/baguette-proceso-background.jpg). No se atribuyen estas fotos a productos ficticios; el catálogo no se presenta como carta/precios oficiales.

## Decisiones de esta aplicación

Herramienta de trabajo con salón como entrada, densidad útil, panel lateral de cuenta, estados escritos y controles grandes. Fondo suave claro al iniciar. El modo oscuro es una adaptación propia y su preferencia se conserva en el dispositivo. Sin métricas decorativas. Las mesas, categorías, imágenes cargadas, precios y políticas de esta demo son ficticios o propuestos y deben validarse con el encargado. Bootstrap se personaliza con los colores observados, conservando contraste de texto y foco visible.

## Referencias

Baguette. (s. f.). _Café y Panadería en Mar del Plata_. Recuperado el 18 de octubre de 2026, de https://baguette.com.ar/

Baguette. (s. f.). _Elementor kit 5_ [Hoja de estilo]. Recuperado el 18 de octubre de 2026, de https://baguette.com.ar/wp-content/uploads/elementor/css/post-5.css
