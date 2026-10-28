# Tono · Afinador cromático

Un afinador cromático ligero en español, con temperamentos igual, justo, pitagórico y mesotónico. El audio se analiza localmente en el navegador y nunca se envía a un servidor.

## Ejecutar

Sirve los archivos estáticos desde un origen seguro (`localhost` o HTTPS), porque el navegador solo permite acceso al micrófono en esos contextos. Por ejemplo, desde la carpeta del proyecto:

```sh
python -m http.server 8000
```

Luego abre `http://localhost:8000`. No requiere compilación ni dependencias.

## Estructura

- `src/pitch.js`: detección de tono y referencias de temperamento.
- `src/dial.js`: dibujo del indicador de centésimas en canvas.
- `src/main.js`: interfaz, micrófono, estados y ciclo de análisis.
- `styles.css`: estilos adaptables y controles accesibles.
