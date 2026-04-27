require('dotenv').config();
const express    = require('express');
const cors       = require('cors');
const { google } = require('googleapis');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// ── Google OAuth2 Client ──────────────────────────────────────────
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/auth/callback'
);

// IDs de los calendarios
const CALENDARS = {
  Cami: process.env.CALENDAR_ID_CAMI,
  Vale: process.env.CALENDAR_ID_VALE
};

// Duración de servicios en minutos
const SERVICE_DURATION = {
  'Lifting + Tinte + Botox':              90,
  'Laminado':                             90,
  'Lifting + Laminado':                  120,
  'Efecto Maquillaje / Rímel':           120,
  'Efecto Maquillaje / Rímel — Retoque': 90,
  'Técnica Mixta':                       120,
  'Técnica Mixta — Retoque':             90,
  'Volumen 3D / 4D / 5D':               150,
  'Volumen 3D / 4D / 5D — Retoque':     90,
  'Volumen Ruso 6D+':                    180,
  'Volumen Ruso 6D+ — Retoque':         120,
  'Bloques de Color':                     30,
  'Retiro de Extensiones (otro lugar)':   45,
  'Perfilado con Pinzas':                 30
};

// ── Ruta de autenticación Google ─────────────────────────────────
app.get('/auth', (req, res) => {
  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: ['https://www.googleapis.com/auth/calendar'],
    prompt: 'consent'
  });
  res.redirect(url);
});

app.get('/auth/callback', async (req, res) => {
  const { code } = req.query;
  try {
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);
    // En producción guardar tokens en DB o variables de entorno
    console.log('✅ Tokens obtenidos:', JSON.stringify(tokens));
    res.send(`
      <h2>✅ Autenticación exitosa</h2>
      <p>Copia este Refresh Token y agrégalo como variable de entorno <strong>GOOGLE_REFRESH_TOKEN</strong> en Railway:</p>
      <code style="background:#f0f0f0;padding:1rem;display:block;word-break:break-all;margin-top:1rem;">${tokens.refresh_token || 'Ya tenías un token previo — revisa la consola del servidor'}</code>
      <p style="margin-top:1rem;">Luego reinicia el servidor en Railway.</p>
    `);
  } catch (err) {
    console.error('Error en auth:', err);
    res.status(500).send('Error en autenticación: ' + err.message);
  }
});

// ── Middleware: verificar token ───────────────────────────────────
function setCredentials() {
  if (process.env.GOOGLE_REFRESH_TOKEN) {
    oauth2Client.setCredentials({
      refresh_token: process.env.GOOGLE_REFRESH_TOKEN
    });
  }
}

// ── GET /availability — horarios disponibles por profesional y fecha ──
app.get('/availability', async (req, res) => {
  const { profesional, fecha } = req.query;

  if (!profesional || !fecha) {
    return res.status(400).json({ error: 'Faltan parámetros: profesional y fecha' });
  }

  const calendarId = CALENDARS[profesional];
  if (!calendarId) {
    return res.status(400).json({ error: 'Profesional no válida' });
  }

  try {
    setCredentials();
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

    // Rango del día completo
    const start = new Date(fecha + 'T00:00:00-04:00'); // Chile UTC-4
    const end   = new Date(fecha + 'T23:59:59-04:00');

    const events = await calendar.events.list({
      calendarId,
      timeMin: start.toISOString(),
      timeMax: end.toISOString(),
      singleEvents: true,
      orderBy: 'startTime'
    });

    // Horarios base
    const allSlots = ['09:00','10:00','11:00','12:00','14:00','15:00','16:00','17:00','18:00'];

    // Marcar ocupados
    const busyRanges = (events.data.items || []).map(ev => ({
      start: new Date(ev.start.dateTime || ev.start.date),
      end:   new Date(ev.end.dateTime   || ev.end.date)
    }));

    const availability = allSlots.map(slot => {
      const [h, m] = slot.split(':').map(Number);
      const slotStart = new Date(fecha + 'T' + slot + ':00-04:00');
      const slotEnd   = new Date(slotStart.getTime() + 90 * 60000); // 90 min buffer

      const isBusy = busyRanges.some(range =>
        slotStart < range.end && slotEnd > range.start
      );

      return { slot, available: !isBusy };
    });

    res.json({ profesional, fecha, availability });

  } catch (err) {
    console.error('Error consultando calendario:', err.message);
    res.status(500).json({ error: 'Error al consultar disponibilidad' });
  }
});

// ── POST /reservar — crear evento en Google Calendar ─────────────
app.post('/reservar', async (req, res) => {
  const { profesional, servicio, fecha, hora, nombre, telefono, precio, nota, descuento } = req.body;

  if (!profesional || !servicio || !fecha || !hora || !nombre || !telefono) {
    return res.status(400).json({ error: 'Faltan campos obligatorios' });
  }

  const calendarId = CALENDARS[profesional];
  if (!calendarId) {
    return res.status(400).json({ error: 'Profesional no válida' });
  }

  try {
    setCredentials();
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

    const duracion = SERVICE_DURATION[servicio] || 90;
    const [h, m]   = hora.split(':').map(Number);

    const startTime = new Date(`${fecha}T${hora}:00-04:00`);
    const endTime   = new Date(startTime.getTime() + duracion * 60000);

    const descuentoTexto = descuento ? ` | Código: ${descuento}` : '';
    const notaTexto      = nota      ? `\nNota: ${nota}`         : '';

    const event = {
      summary: `${servicio} — ${nombre}`,
      description:
        `👤 Cliente: ${nombre}\n` +
        `📱 Teléfono: ${telefono}\n` +
        `💅 Servicio: ${servicio}\n` +
        `💰 Precio: $${parseInt(precio).toLocaleString('es-CL')}${descuentoTexto}` +
        notaTexto,
      start: { dateTime: startTime.toISOString(), timeZone: 'America/Santiago' },
      end:   { dateTime: endTime.toISOString(),   timeZone: 'America/Santiago' },
      colorId: profesional === 'Cami' ? '11' : '7', // rojo para Cami, turquesa para Vale
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'popup', minutes: 60 },
          { method: 'popup', minutes: 1440 } // 24hrs antes
        ]
      }
    };

    const created = await calendar.events.insert({ calendarId, resource: event });

    console.log(`✅ Reserva creada: ${nombre} — ${servicio} con ${profesional} el ${fecha} a las ${hora}`);

    res.json({
      success: true,
      eventId: created.data.id,
      message: `Reserva confirmada para ${nombre} con ${profesional}`
    });

  } catch (err) {
    console.error('Error creando reserva:', err.message);
    res.status(500).json({ error: 'Error al crear la reserva: ' + err.message });
  }
});

// ── GET /health — verificar que el servidor funciona ─────────────
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    server: 'Cami Pestañas Backend',
    timestamp: new Date().toISOString()
  });
});

app.listen(PORT, () => {
  console.log(`🚀 Servidor Cami Pestañas corriendo en puerto ${PORT}`);
});
