# Casino ULS — Medición de tiempos OR

App para medir tiempos en terreno (casino universitario) con 3 celulares sincronizados en tiempo real vía Supabase.

## Roles en terreno

| Persona | Rol | Qué toca |
|---------|-----|----------|
| 1 | Llegadas | Botón cada vez que alguien entra a la fila |
| 2 | Inicio atención | Botón cuando el cajero empieza a atender |
| 3 | Fin atención | Botón cuando el cajero termina |

Los tres usan la misma URL, cada uno selecciona su rol al entrar.

---

## Setup (una sola vez)

### 1. Supabase

1. Entra a [supabase.com](https://supabase.com) → tu proyecto
2. Ve a **SQL Editor** y ejecuta todo el contenido de `schema.sql`
3. Ve a **Settings → API** y copia:
   - **Project URL** → `https://xxxx.supabase.co`
   - **anon / public key**

> La función `now_ms` que usa la app para sincronizar el reloj entre teléfonos
> también se crea en `schema.sql`. Si ves error de RPC, vuelve a ejecutar el SQL.

### 2. Credenciales en el código

Abre `index.html` y reemplaza las dos líneas marcadas:

```js
window.SB_URL = 'https://TU_PROYECTO.supabase.co';
window.SB_KEY = 'TU_ANON_KEY';
```

> **Para producción en Vercel** puedes usar variables de entorno en lugar de hardcodear:
> añade `VITE_SB_URL` y `VITE_SB_KEY` en Vercel → Settings → Environment Variables,
> y reemplaza las líneas por:
> ```js
> window.SB_URL = '%%VITE_SB_URL%%';
> window.SB_KEY = '%%VITE_SB_KEY%%';
> ```
> (Vercel las inyecta automáticamente en el build.)

### 3. GitHub + Vercel

```bash
git init
git add .
git commit -m "init casino-uls"
git remote add origin https://github.com/TU_USUARIO/casino-uls.git
git push -u origin main
```

Luego en [vercel.com](https://vercel.com):
- **New Project → Import** desde GitHub
- Framework: **Other**
- Deploy → listo, te da una URL pública

Comparte esa URL con los 3 celulares del grupo. No necesitan instalar nada.

---

## Comportamiento offline

Si el celular pierde señal durante la medición:
- Los eventos se guardan en `localStorage` del navegador
- Al recuperar conexión (automático o con el botón ↺) se sincronizan a Supabase
- El badge naranja **"↑ N"** en la topbar indica cuántos eventos están pendientes

---

## Cómo usar los datos en Minitab

1. Ve a **Resumen → Exportar CSV**
2. Abre el CSV en Excel
3. Las dos últimas secciones del archivo tienen columnas listas:
   - `Entre_llegadas_s` → ajuste de distribución para tiempo entre llegadas
   - `Tiempo_atencion_s` → ajuste de distribución para tiempo de atención
4. En Minitab: **Stat → Quality Tools → Individual Distribution Identification**
5. Prueba Exponencial y Poisson primero (son las más comunes en colas de casino)

---

## Archivos

```
casino-uls/
├── index.html      ← App completa (vanilla JS)
├── supabase.js     ← Cliente Supabase + cola offline
├── sw.js           ← Service Worker (offline support)
├── schema.sql      ← Ejecutar en Supabase SQL Editor
├── vercel.json     ← Config de deploy
└── README.md
```
