# Cami Pestañas — Servidor Backend

## Archivos
- `index.js` — servidor principal
- `package.json` — dependencias
- `.env.example` — variables de entorno de ejemplo

## Despliegue en Railway

### 1. Subir a GitHub
1. Crea un repositorio nuevo en github.com llamado `cami-server`
2. Sube los archivos `index.js`, `package.json` y `.env.example`

### 2. Conectar Railway
1. En railway.app haz clic en "New Project"
2. Selecciona "Deploy from GitHub repo"
3. Elige el repositorio `cami-server`

### 3. Agregar variables de entorno
En Railway ve a tu proyecto → "Variables" y agrega:
- GOOGLE_CLIENT_ID
- GOOGLE_CLIENT_SECRET
- GOOGLE_REDIRECT_URI → https://TU_SUBDOMINIO.up.railway.app/auth/callback
- CALENDAR_ID_CAMI
- CALENDAR_ID_VALE

### 4. Obtener Refresh Token
1. Una vez desplegado visita: https://TU_SUBDOMINIO.up.railway.app/auth
2. Autoriza con la cuenta de Google de Cami
3. Copia el Refresh Token que aparece
4. Agrégalo en Railway como variable GOOGLE_REFRESH_TOKEN
5. Reinicia el servidor

### 5. Verificar
Visita: https://TU_SUBDOMINIO.up.railway.app/health
Debe responder: { "status": "ok" }

## Endpoints
- GET  /health              — verifica que funciona
- GET  /auth                — autenticación Google
- GET  /auth/callback       — callback OAuth
- GET  /availability        — horarios disponibles
- POST /reservar            — crear reserva en calendario
