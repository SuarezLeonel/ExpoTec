# Guion vigente de reunión

Preparación: PostgreSQL y versión compilada activos, datos ficticios y evidencia revisada. `/` es la terminal compartida; `/gestion` exige contraseña para caja/encargado. Los servicios externos son simulados. Restaurar solo con administrador, entorno demo y confirmación literal `RESTAURAR DEMO`.

La instrucción posterior cambia los recorridos originales de identificación y preparación. Se conserva su cobertura funcional, adaptada a PIN en cada entrada y Pedido sin etapas de cocina/entrega. **Documentado no significa probado**: consultar [ESTADO-PRUEBAS.md](ESTADO-PRUEBAS.md).

| #   | Pasos vigentes                                                                                                                   | Resultado esperado                                                                                                                                                    |
| --- | -------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Abrir salón sin login, tocar mesa libre, PIN identifica empleado, agregar extras/notas y enviar. Cerrar panel y volver con PIN.  | Carta directa; consumo en Pedido; no selector de empleado ni preparación obligatoria; nueva identificación al reentrar.                                               |
| 2   | Entrar con PIN a mesa ocupada; cambiar responsable/posición o trasladar cuenta con permiso.                                      | Actor y responsable diferenciados; plano y traslado distintos; consumo conservado.                                                                                    |
| 3   | Desde Gestión, unir/separar mesas; dividir cantidades/ítems y trasladar consumos válidos entre mesas.                            | Agrupación física y cuentas independientes, sin pérdida; pagos/descuentos incompatibles bloqueados. La terminal limita las cuentas relacionadas a su mesa autorizada. |
| 4   | Camarero intenta descuento/anulación; caja/encargado acceden por gestión y realizan el ajuste permitido.                         | Rechazo real al camarero, incluso con credenciales ajenas; motivo y auditoría de la operación autorizada.                                                             |
| 5   | Anular con permiso; en venta cobrada registrar devolución y reintegro.                                                           | Venta/pago preservados; cantidad y neto de descuentos limitan devolución; no requisito de etapa Entregado.                                                            |
| 6   | Enviar Pedido, dividir/cobrar parcial con débito y efectivo/vuelto, completar saldo y cerrar.                                    | Importes exactos, sin doble cobro; cierre sin saldo y sin avanzar cocina/listo/entregado.                                                                             |
| 7   | Resolver caja precargada y pendientes, registrar movimientos, arquear/cerrar y abrir una nueva.                                  | Efectivo esperado/diferencia correctos; bloqueos financieros explicados.                                                                                              |
| 8   | PIN administrador en terminal intenta gestionar catálogo; luego entrar por `/gestion`, editar y verificar carta pública/impresa. | Terminal rechazada incluso con ese PIN; gestión autorizada; un catálogo y ventas históricas conservadas.                                                              |
| 9   | Repetir clave/contenido; cambiar contenido; editar misma versión desde dos clientes.                                             | Replay sin duplicado y conflictos visibles con actor/contexto correctos.                                                                                              |
| 10  | Crear pendiente admitido con corte real, recargar, reconectar, identificar mismo empleado y sincronizar.                         | Cola conservada sin PIN/token; autorización online nueva y exactamente una operación. Ningún cobro local confirmado.                                                  |
| 11  | Impresora simulada desconectada, reintento seguro, incertidumbre y copia con motivo.                                             | Estados persistidos, copia marcada y auditada; no promesa de papel físico.                                                                                            |
| 12  | Cobro confirmado; rechazo/incertidumbre fiscal simulados; consultar y resolver.                                                  | Pago intacto, mismo documento y “Demostración. Sin validez fiscal”.                                                                                                   |
| 13  | PIN incorrecto, ceros iniciales, duplicado activo, cruce de mesa/terminal y gestión; probar muchas mesas y pantallas pequeñas.   | Identidad inequívoca; tokens ajenos/reutilizados rechazados según alcance; terminal sin privilegios de gestión; documento inicial sin scroll y paginación accesible.  |

## Preguntas para el encargado

- ¿Qué empleados y sufijos habilitan? ¿Cómo resolverán dos DNI con el mismo sufijo sin guardar el documento completo ni permitir identificación ambigua?
- ¿Quién puede cobrar, cerrar, anular o descontar? ¿Deben hacerlo exclusivamente desde gestión? ¿Qué acciones operativas admiten los distintos PIN en terminal?
- ¿Qué identificaciones, sectores, capacidades y combinaciones de mesas existen? ¿Qué paginación prefieren en el dispositivo real?
- ¿Cómo cambian responsables/turnos y resuelven mesas abiertas, cortesías, errores y cuentas parcialmente cobradas?
- ¿Dividen por ítems, cantidades, partes o importes? ¿Cómo manejan centavos, efectivo/vuelto, diferencias de caja y reintegros?
- ¿Qué impresoras, cantidad, ubicación, papel, conexiones, sistema operativo y controladores usan? ¿Cómo distinguen correcciones/copias y confirman papel?
- ¿Cuántas terminales habrá? ¿Qué teléfonos/tablets y red utilizan? ¿Qué hacen durante cortes si no se puede verificar un PIN nuevo?
- ¿Quién aprueba precios, disponibilidad, imágenes y carta impresa? ¿Qué recursos de marca pueden reutilizarse?
- Con contabilidad: emisor, condición fiscal, punto de venta, comprobantes, receptor, impuestos, servicio ARCA, homologación, certificados y responsables ante pendientes/notas de crédito.
- ¿Qué respaldos, retención, recuperación y evidencia de permisos/caja necesitan? ¿Quién valida el prototipo en sus dispositivos?

Registrar decisión, responsable y fecha. Las preguntas operativas no convierten los adaptadores en integraciones reales.
