# 🍽 DiviCuenta

**DiviCuenta** es una aplicación web mobile-first para dividir la cuenta del restaurante de forma justa entre un grupo de amigos, diferenciando lo que ha consumido cada uno en bebidas del reparto equitativo de la comida.

## ¿Para qué sirve?

Cuando sales a comer con amigos y unos han bebido agua y otros vino caro, no es justo pagar a partes iguales. DiviCuenta permite:

- Registrar a cada comensal con sus bebidas y cantidades.
- Anotar los platos de comida común que se reparten entre todos.
- Calcular automáticamente lo que debe pagar cada persona.
- Validar que el total calculado coincide con el ticket real.

## Cómo usarla

1. **Abre `index.html`** en el navegador del móvil (o de cualquier dispositivo).
2. **Añade comensales**: escribe el nombre de cada persona y pulsa _+ Añadir_.
3. **Registra las bebidas**: dentro del bloque de cada comensal, introduce la bebida, el precio unitario y la cantidad, y pulsa _+ Añadir_.
4. **Añade la comida común**: en la sección _Comida común_, introduce cada plato con su precio y pulsa _+ Añadir_.
5. **Introduce el total del ticket**: escribe el importe total que aparece en la cuenta del restaurante.
6. **Consulta el resumen**: la sección _Resumen del reparto_ muestra lo que debe pagar cada persona y si el cálculo cuadra con el ticket.

## Reglas de reparto

| Concepto | Cálculo |
|---|---|
| **Bebidas** | Cada comensal paga exactamente sus propias bebidas: `Σ (precio unitario × cantidad)` |
| **Comida común** | Se divide a partes **iguales** entre todos los comensales: `total comida ÷ número de comensales` |
| **Total por persona** | `bebidas propias + parte de comida` |
| **Validación** | `diferencia = total ticket − total calculado`; si la diferencia es inferior a 0,02 € se considera que **cuadra** |

> Los importes se redondean a 2 decimales en cada operación para minimizar errores de coma flotante.

## Estructura de ficheros

```
DiviCuenta/
├── index.html   # Estructura HTML de la app
├── styles.css   # Estilos mobile-first
├── app.js       # Lógica de la aplicación (vanilla JS)
└── README.md    # Este documento
```

## Requisitos

Ninguno. Solo hace falta un navegador moderno. No requiere servidor, ni conexión a internet, ni instalación de dependencias.
