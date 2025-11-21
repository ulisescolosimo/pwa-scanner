# Instrucciones para crear los iconos de la PWA

Para que la PWA sea instalable, necesitas crear los siguientes iconos:

## Iconos requeridos:

1. **icon-192x192.png** - Icono de 192x192 píxeles
2. **icon-512x512.png** - Icono de 512x512 píxeles

## Opciones para generar los iconos:

### Opción 1: Generador online (Recomendado)
1. Visita: https://www.pwabuilder.com/imageGenerator
2. Sube una imagen (preferiblemente 512x512 o más grande)
3. Descarga los iconos generados
4. Colócalos en `public/icons/`

### Opción 2: Herramientas de diseño
- **Figma**: Crea un diseño cuadrado de 512x512 y exporta a PNG
- **Photoshop/GIMP**: Crea un diseño cuadrado y exporta en los tamaños requeridos
- **Canva**: Crea un diseño cuadrado y descarga en los tamaños necesarios

### Opción 3: Desde línea de comandos (si tienes ImageMagick)
```bash
# Crear icono de 192x192
convert logo.png -resize 192x192 public/icons/icon-192x192.png

# Crear icono de 512x512
convert logo.png -resize 512x512 public/icons/icon-512x512.png
```

## Recomendaciones:
- Usa colores contrastantes (la app tiene tema oscuro)
- Asegúrate de que el icono sea legible en tamaño pequeño
- Considera agregar texto o símbolo que represente "escanear" o "tickets"
- Los iconos deben ser cuadrados (aspect ratio 1:1)

## Verificar instalación:
Después de agregar los iconos:
1. Ejecuta `npm run dev`
2. Abre la app en el navegador
3. Verifica en DevTools > Application > Manifest que los iconos se carguen correctamente
4. Intenta instalar la PWA

