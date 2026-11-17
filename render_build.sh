#!/usr/bin/env bash
# Compilación en Render (tarea 1.4). Las migraciones van aparte, en el
# preDeployCommand de render.yaml.
# Sale al primer error.
set -o errexit

# Instala exactamente lo que dice package-lock.json y compila el frontend en dist/.
# La versión de Node sale de .node-version (la misma que en local).
npm ci
npm run build

# Python: Render trae pip, pero no pipenv. pipenv se instala solo para leer el
# Pipfile.lock, que sigue siendo la única lista de paquetes; los instala pip.
python -m pip install --disable-pip-version-check "pipenv==2026.11.0"
# Falla si el Pipfile.lock no cuadra con el Pipfile (lo que antes hacía --deploy).
pipenv verify
# Lista exacta del lock, con versiones y huellas sha256. Con --require-hashes,
# pip rechaza cualquier paquete cuya huella no coincida con la del lock.
requirements_file="$(mktemp)"
pipenv requirements --hash > "$requirements_file"
python -m pip install --disable-pip-version-check --require-hashes -r "$requirements_file"
rm -f "$requirements_file"
