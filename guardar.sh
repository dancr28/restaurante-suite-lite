#!/bin/bash
cd ~/restaurante-suite-lite
git add .
git commit -m "feat: avance de desarrollo Restaurante Suite Lite ($(date '+%Y-%m-%d %H:%M:%S'))"
git push origin main
echo "--------------------------------------------------------"
echo "✓ Avance de Restaurante Suite Lite guardado en GitHub"
echo "--------------------------------------------------------"
