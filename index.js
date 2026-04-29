require('dotenv').config();
const express    = require('express');
const cors       = require('cors');
const { google } = require('googleapis');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/auth/callback'
);

const CALENDARS = {
  Cami: process.env.CALENDAR_ID_CAMI,
  Vale: process.env.CALENDAR_ID_VALE
};

const SERVICE_DURATION = {
  'Lifting + Tinte + Botox':              90,
  'Laminado':                             90,
  'Lifting + Laminado':                  120,
  'Efecto Maquillaje / Rimal':           120,
  'Efecto Maquillaje / Rimal — Retoque': 90,
  'Tecnica Mixta':                       120,
  'Tecnica Mixta — Retoque':             90,
  'Volumen 3D / 4D / 5D':               150,
  'Volumen 3D / 4D / 5D — Retoque':     90,
  'Volumen Ruso 6D+':                    180,
  'Volumen Ruso 6D+ — Retoque':         120,
  'Bloques de Color':                     30,
  'Retiro de Extensiones (otro lugar)':   45,
  'Perfilado con Pinzas':                 30
};

// ── Envio de correos con Resend ───────────────────────────────────
async function sendEmail({ to, subject, html }) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: 'Cami Pestanas <reservas@xn--camipestaas-9db.cl>',
      to,
      subject,
      html
    })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data));
  return data;
}

function emailCami({ profesional, servicio, fecha, hora, nombre, telefono, precio, nota, descuento }) {
  const descuentoHtml = descuento ? `<tr><td><b>Codigo descuento:</b></td><td>${descuento}</td></tr>` : '';
  const notaHtml      = nota      ? `<tr><td><b>Comentario:</b></td><td>${nota}</td></tr>` : '';
  return `
    <div style="font-family:sans-serif;max-width:520px;margin:0 auto;border:1px solid #e0dbd4;border-radius:12px;overflow:hidden;">
      <div style="background:#b83232;padding:1.5rem 2rem;">
        <h1 style="color:white;margin:0;font-size:1.4rem;">Nueva Reserva</h1>
        <p style="color:#f5c6c6;margin:.3rem 0 0;font-size:.9rem;">Cami Pestanas</p>
      </div>
      <div style="padding:1.5rem 2rem;">
        <table style="width:100%;border-collapse:collapse;font-size:.95rem;">
          <tr style="border-bottom:1px solid #f0ebe4;"><td style="padding:.6rem 0;color:#5a5a5a;width:140px;"><b>Profesional:</b></td><td style="padding:.6rem 0;">${profesional}</td></tr>
          <tr style="border-bottom:1px solid #f0ebe4;"><td style="padding:.6rem 0;color:#5a5a5a;"><b>Servicio:</b></td><td style="padding:.6rem 0;">${servicio}</td></tr>
          <tr style="border-bottom:1px solid #f0ebe4;"><td style="padding:.6rem 0;color:#5a5a5a;"><b>Fecha:</b></td><td style="padding:.6rem 0;">${fecha}</td></tr>
          <tr style="border-bottom:1px solid #f0ebe4;"><td style="padding:.6rem 0;color:#5a5a5a;"><b>Hora:</b></td><td style="padding:.6rem 0;">${hora}</td></tr>
          <tr style="border-bottom:1px solid #f0ebe4;"><td style="padding:.6rem 0;color:#5a5a5a;"><b>Precio:</b></td><td style="padding:.6rem 0;">$${parseInt(precio).toLocaleString('es-CL')}</td></tr>
          <tr style="border-bottom:1px solid #f0ebe4;"><td style="padding:.6rem 0;color:#5a5a5a;"><b>Cliente:</b></td><td style="padding:.6rem 0;">${nombre}</td></tr>
          <tr style="border-bottom:1px solid #f0ebe4;"><td style="padding:.6rem 0;color:#5a5a5a;"><b>Telefono:</b></td><td style="padding:.6rem 0;">${telefono}</td></tr>
          ${descuentoHtml}
          ${notaHtml}
        </table>
        <p style="margin-top:1.5rem;font-size:.85rem;color:#888;">Reserva registrada automaticamente en Google Calendar.</p>
      </div>
    </div>
  `;
}

function emailClienta({ profesional, servicio, fecha, hora, nombre, precio, descuento }) {
  const abonoTexto = descuento
    ? 'Tu reserva tiene descuento del 100%. Solo confirma por WhatsApp.'
    : 'Recuerda pagar el abono de $15.000 para confirmar tu hora.';
  return `
    <div style="font-family:sans-serif;max-width:520px;margin:0 auto;border:1px solid #e0dbd4;border-radius:12px;overflow:hidden;">
      <div style="background:#b83232;padding:1.5rem 2rem;">
        <h1 style="color:white;margin:0;font-size:1.4rem;">Reserva Recibida</h1>
        <p style="color:#f5c6c6;margin:.3rem 0 0;font-size:.9rem;">Cami Pestanas — Tu Nueva Mirada</p>
      </div>
      <div style="padding:1.5rem 2rem;">
        <p style="font-size:1rem;color:#1a1a1a;">Hola <b>${nombre}</b>, recibimos tu solicitud de reserva.</p>
        <table style="width:100%;border-collapse:collapse;font-size:.95rem;margin-top:1rem;">
          <tr style="border-bottom:1px solid #f0ebe4;"><td style="padding:.6rem 0;color:#5a5a5a;width:140px;"><b>Profesional:</b></td><td style="padding:.6rem 0;">${profesional}</td></tr>
          <tr style="border-bottom:1px solid #f0ebe4;"><td style="padding:.6rem 0;color:#5a5a5a;"><b>Servicio:</b></td><td style="padding:.6rem 0;">${servicio}</td></tr>
          <tr style="border-bottom:1px solid #f0ebe4;"><td style="padding:.6rem 0;color:#5a5a5a;"><b>Fecha:</b></td><td style="padding:.6rem 0;">${fecha}</td></tr>
          <tr style="border-bottom:1px solid #f0ebe4;"><td style="padding:.6rem 0;color:#5a5a5a;"><b>Hora:</b></td><td style="padding:.6rem 0;">${hora}</td></tr>
          <tr style="border-bottom:1px solid #f0ebe4;"><td style="padding:.6rem 0;color:#5a5a5a;"><b>Precio:</b></td><td style="padding:.6rem 0;">$${parseInt(precio).toLocaleString('es-CL')}</td></tr>
        </table>
        <div style="background:#fff8f8;border:1px solid #e8c4c4;border-radius:8px;padding:1rem;margin-top:1.5rem;font-size:.9rem;color:#8a1f1f;">
          ${abonoTexto}
        </div>
        <p style="margin-top:1.5rem;font-size:.85rem;color:#888;">Para cancelar o cambiar tu hora escribe al WhatsApp +56 9 6831 4567.</p>
        <p style="font-size:.85rem;color:#888;">Cami Pestanas — Santiago, Chile</p>
      </div>
    </div>
  `;
}

// ── Auth Google ───────────────────────────────────────────────────
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
    res.send(`
      <h2>Autenticacion exitosa</h2>
      <p>Copia este Refresh Token y agregalo como variable GOOGLE_REFRESH_TOKEN en Railway:</p>
      <code style="background:#f0f0f0;padding:1rem;display:block;word-break:break-all;margin-top:1rem;">${tokens.refresh_token || 'Ya tenias un token previo'}</code>
    `);
  } catch (err) {
    res.status(500).send('Error: ' + err.message);
  }
});

function setCredentials() {
  if (process.env.GOOGLE_REFRESH_TOKEN) {
    oauth2Client.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
  }
}

// ── GET /availability ─────────────────────────────────────────────
app.get('/availability', async (req, res) => {
  const { profesional, fecha } = req.query;
  if (!profesional || !fecha) return res.status(400).json({ error: 'Faltan parametros' });

  const calendarId = CALENDARS[profesional];
  if (!calendarId) return res.status(400).json({ error: 'Profesional no valida' });

  try {
    setCredentials();
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
    const start    = new Date(fecha + 'T00:00:00-04:00');
    const end      = new Date(fecha + 'T23:59:59-04:00');

    const events = await calendar.events.list({
      calendarId,
      timeMin: start.toISOString(),
      timeMax: end.toISOString(),
      singleEvents: true,
      orderBy: 'startTime'
    });

    const allSlots   = ['09:00','10:00','11:00','12:00','14:00','15:00','16:00','17:00','18:00'];
    const busyRanges = (events.data.items || []).map(ev => ({
      start: new Date(ev.start.dateTime || ev.start.date),
      end:   new Date(ev.end.dateTime   || ev.end.date)
    }));

    const availability = allSlots.map(slot => {
      const slotStart = new Date(fecha + 'T' + slot + ':00-04:00');
      const slotEnd   = new Date(slotStart.getTime() + 90 * 60000);
      const isBusy    = busyRanges.some(r => slotStart < r.end && slotEnd > r.start);
      return { slot, available: !isBusy };
    });

    res.json({ profesional, fecha, availability });
  } catch (err) {
    res.status(500).json({ error: 'Error al consultar disponibilidad' });
  }
});

// ── POST /reservar ────────────────────────────────────────────────
app.post('/reservar', async (req, res) => {
  const { profesional, servicio, fecha, hora, nombre, telefono, correo, precio, nota, descuento } = req.body;

  if (!profesional || !servicio || !fecha || !hora || !nombre || !telefono) {
    return res.status(400).json({ error: 'Faltan campos obligatorios' });
  }

  const calendarId = CALENDARS[profesional];
  if (!calendarId) return res.status(400).json({ error: 'Profesional no valida' });

  try {
    // 1. Guardar en Google Calendar
    setCredentials();
    const calendar  = google.calendar({ version: 'v3', auth: oauth2Client });
    const duracion  = SERVICE_DURATION[servicio] || 90;
    const startTime = new Date(`${fecha}T${hora}:00-04:00`);
    const endTime   = new Date(startTime.getTime() + duracion * 60000);

    const event = {
      summary: `${servicio} — ${nombre}`,
      description:
        `Cliente: ${nombre}\n` +
        `Telefono: ${telefono}\n` +
        `Servicio: ${servicio}\n` +
        `Precio: $${parseInt(precio).toLocaleString('es-CL')}` +
        (descuento ? ` | Codigo: ${descuento}` : '') +
        (nota      ? `\nNota: ${nota}`          : ''),
      start:    { dateTime: startTime.toISOString(), timeZone: 'America/Santiago' },
      end:      { dateTime: endTime.toISOString(),   timeZone: 'America/Santiago' },
      colorId:  profesional === 'Cami' ? '11' : '7',
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'popup', minutes: 60 },
          { method: 'popup', minutes: 1440 }
        ]
      }
    };

    const created = await calendar.events.insert({ calendarId, resource: event });

    // 2. Correo a Cami
    try {
      await sendEmail({
        to:      'cami.pestanas@gmail.com',
        subject: `Nueva reserva: ${nombre} — ${servicio} el ${fecha} a las ${hora}`,
        html:    emailCami({ profesional, servicio, fecha, hora, nombre, telefono, precio, nota, descuento })
      });
    } catch(e) {
      console.warn('No se pudo enviar correo a Cami:', e.message);
    }

    // 3. Correo a la clienta (solo si ingreso su correo)
    if (correo) {
      try {
        await sendEmail({
          to:      correo,
          subject: `Tu reserva en Cami Pestanas — ${fecha} a las ${hora}`,
          html:    emailClienta({ profesional, servicio, fecha, hora, nombre, precio, descuento })
        });
      } catch(e) {
        console.warn('No se pudo enviar correo a clienta:', e.message);
      }
    }

    console.log(`Reserva creada: ${nombre} con ${profesional} el ${fecha} a las ${hora}`);
    res.json({ success: true, eventId: created.data.id });

  } catch (err) {
    console.error('Error creando reserva:', err.message);
    res.status(500).json({ error: 'Error al crear la reserva: ' + err.message });
  }
});

// ── GET /health ───────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ status: 'ok', server: 'Cami Pestanas Backend', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`Servidor Cami Pestanas corriendo en puerto ${PORT}`);
});
