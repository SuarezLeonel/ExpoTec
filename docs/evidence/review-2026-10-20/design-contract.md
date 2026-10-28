# Contrato de diseño y usabilidad · 20 de octubre de 2026

## Superficies y propósito

Herramienta operativa Baguette para comandar durante el turno y administrar el catálogo. La tarea principal del salón es encontrar una mesa, identificarse y agregar productos; la de gestión es encontrar un registro y editarlo sin perder contexto.

Dirección: interfaz de trabajo sobria, compacta y legible. Se conserva la identidad local documentada en `docs/IDENTIDAD.md`: azul de navegación, crema de fondo, dorado para acentos, Apollo para títulos y tipografía sans para controles. El detalle útil es una selección de agregados visible y táctil, en lugar de requerir teclas modificadoras.

## Restricciones comprobables

| Decisión                                                       | Referencia local                                                                       | Verificación prevista                                                                                              |
| -------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Mantener jerarquía salón → mesa → producto → pedido            | `Salon.tsx`, `TableOrderWorkspace.tsx`, `docs/IDENTIDAD.md`                            | La primera pantalla permite buscar mesas; los cambios no introducen una portada                                    |
| Agregados con casillas independientes y etiquetas completas    | `FieldsForm`, `ProductPicker.tsx` y `Catalog.tsx` usan selección múltiple con Ctrl/Cmd | Se seleccionan y deseleccionan varios agregados con teclado o un toque; el valor enviado continúa siendo una lista |
| Formularios con foco en primer campo inválido y espera visible | Validación actual en `components/UI.tsx`                                               | Envío vacío enfoca el primer error; durante envío se impiden duplicados y se anuncia espera                        |
| Búsquedas sin resultados con recuperación                      | Catálogo muestra una tabla vacía cuando existen registros pero ninguno coincide        | Se informa el resultado y se ofrece limpiar el filtro; filtros activos tienen estado accesible                     |
| Controles táctiles principales de al menos 44 px               | Terminal y comanda móvil con controles de 27–38 px                                     | Revisión de controles modificados, sin comprometer densidad de mesas                                               |
| Textos largos no desbordan ni recortan el nombre del producto  | Cuadrícula actual de productos con filas fijas                                         | Verificar ajuste del nombre, precio y botón de agregado                                                            |

Viewports de revisión: `390x844` y `1440x900`. Se verifica foco visible, etiquetas, contraste, modo oscuro, preferencia de movimiento reducido, ancho de documento y ajuste de textos. No se agregan dependencias ni recursos externos.

## Estados relevantes

| Estado   | Disparador                                          | Respuesta y siguiente acción                                                                                               |
| -------- | --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Cargando | Envío de formulario o carga inicial                 | Indicador textual, `aria-busy`, bloqueo de envío repetido; esperar o corregir luego de un error                            |
| Vacío    | Búsqueda que no coincide o grupo de agregados vacío | Mensaje específico y restablecer filtros cuando corresponde; agregado opcional indica que no hay opciones                  |
| Error    | Campo inválido o respuesta rechazada                | Mensaje vinculado al campo, foco en primer error y reintento tras corregir                                                 |
| Parcial  | Productos no disponibles o agregados inactivos      | Las opciones disponibles siguen usables; no se inventan ni restauran opciones que el servidor excluyó                      |
| Éxito    | Ítem/registro guardado                              | Mantener confirmación central del Store y cerrar el formulario cuando corresponde; continuar pedido o editar otro registro |
| Permiso  | Entrada a mesa o sección protegida                  | Mantener PIN y límites de rol existentes; cancelar o volver al salón sin modificar permisos                                |

## Evidencia y límites

Este archivo registra el contrato previo a implementar. Los resultados y las capturas inspeccionadas están en `design-evidence.json`. Se ejercitaron los seis estados, teclado, contraste automático con axe, movimiento reducido, medidas táctiles y ambos viewports del contrato. También se comprobó densidad con 80 mesas en seis tamaños hasta 320 × 568.

La inspección móvil detectó palabras unidas en el título de acceso al ocultarse el salto de línea; se corrigió el espacio y se revisó la recaptura. Las reglas de ingreso, recuperación, nombres, usuarios y catálogo se alinearon con la validación del servidor. Los borradores de formulario se normalizan y los fallos del almacenamiento local no impiden guardar en el servidor.

Las capturas provienen de pruebas locales con datos ficticios. El estado parcial se verifica con una respuesta de carta interceptada y no cambia el catálogo persistente. La revisión automatizada de accesibilidad no sustituye pruebas con todos los lectores de pantalla o dispositivos físicos.
