#!/usr/bin/env bash
# Compilación en Render (tarea 1.4). Las migraciones van aparte, en el
# preDeployCommand de render.yaml.
# Sale al primer error.
set -o errexit

# Instala exactamente lo que dice package-lock.json y compila el frontend en dist/.
npm ci
npm run build

# Instala exactamente lo que dice Pipfile.lock; si no cuadra con el Pipfile, falla.
pipenv install --deploy
