# Documentación PRISMA

Estructura de los documentos del sistema PRISMA.

```
docs/
├── interno/                  → Documentación técnica (NO para clientes). Va al repo.
│   ├── TECNICO-PRISMA.md      → Arquitectura e ingeniería (basado en el código).
│   └── LOGICA-PRISMA.md       → Lógica funcional detallada, endpoint por endpoint.
│
└── compartible/              → Material que puede compartirse con agencias.
    ├── estandarizada/        → Guías funcionales BASE, reutilizables para cualquier agencia. Va al repo.
    │   ├── FUNCIONAL-ASESOR-PRISMA.md
    │   └── FUNCIONAL-DIRECTOR-PRISMA.md
    │
    └── particular/           → Copias por cliente con sus personalizaciones. INTERNO: NO se sube al repo.
        └── <cliente>/        → Una subcarpeta por agencia (ver particular/README.md).
            ├── FUNCIONAL-ASESOR-PRISMA.md
            └── FUNCIONAL-DIRECTOR-PRISMA.md
```

## Reglas

- **`estandarizada/`** es la fuente de verdad evergreen: sin fechas, sin changelog, sin particularidades de un cliente. Se entrega tal cual a cualquier agencia o se usa como base.
- **`particular/`** está **gitignoreado** (excepto su `README.md`): contiene info de clientes y no debe subirse.
- Cuando un cliente tiene personalizaciones (módulos habilitados/deshabilitados, etc.), se parte de la versión estandarizada y se ajusta solo lo que corresponda.
