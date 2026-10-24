# Tienda en línea Vocaciones MHPVM

Tienda en línea y módulo de donativos de Vocaciones MHPVM (Misioneras Hijas de la Purísima Virgen María), Aguascalientes, México.

Repositorio privado. Desarrollo: Enrique González.

## Stack

- Frontend: React + Vite (JavaScript), en `src/front`.
- Backend: Flask + SQLAlchemy, migraciones con Flask-Migrate, en `src/api`.
- Base de datos: PostgreSQL (en desarrollo, SQLite provisional hasta la tarea 1.3).
- Flask sirve también el frontend compilado.

## Requisitos

- Python 3.13 y pipenv.
- Node 22.
- Un archivo `.env` en la raíz con `DATABASE_URL`. Nunca se sube al repositorio.

## Arranque en local

```powershell
pipenv install
npm install
```

En dos terminales:

```powershell
pipenv run start   # backend en http://127.0.0.1:3001
npm run start      # frontend en http://localhost:3000
```

Vite reenvía `/api` a Flask, así que todo se abre desde `http://localhost:3000`. Para comprobar que el backend responde: `http://localhost:3000/api/health`.

## Comandos útiles

- `pipenv run migrate`: genera una migración después de cambiar modelos.
- `pipenv run upgrade`: aplica las migraciones.
- `npm run build`: compila el frontend en `dist/`.

## Reglas del proyecto

Las reglas de negocio, seguridad, SEO y forma de trabajo están en [CLAUDE.md](CLAUDE.md).
