import { createHash } from "crypto";

export const config = {
  runtime: "nodejs",
};

// Endpoint POST /api/send-server-event — Conversions API (CAPI) de Meta.
//
// SELF-CONTAINED A PROPÓSITO: importa solo `crypto`, cero imports relativos. En Vercel
// cada fichero de /api se empaqueta por separado y los imports relativos a carpetas
// hermanas revientan con ERR_MODULE_NOT_FOUND. No lo partas en módulos.
//
// TODO el camino del evento server-side: valida → lee el contexto del request →
// normaliza y hashea los datos personales → arma el payload → POST a Graph API.
// NO escribe en ninguna DB. Usa el MISMO eventId que el pixel del navegador para que
// Meta deduplique (si no, contás cada conversión dos veces).

//@ts-ignore
const GRAPH_VERSION = process.env.META_GRAPH_VERSION || "v23.0";
const TIMEOUT_MS = 6000;

/* ============================================================ HASHING
   Meta exige SHA-256 (hex) sobre el valor YA normalizado. Normalizar mal =
   matching malo: el hash de "Juan@Mail.com " no matchea el de "juan@mail.com". */

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

// Si el valor ya viene hasheado (64 hex) no lo volvemos a hashear: hashear dos veces
// produce un hash válido pero que no matchea con nada.
function isHashed(value: string): boolean {
  return /^[a-f0-9]{64}$/i.test(value);
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

// Devuelve el array que espera user_data, o undefined (las keys undefined las omite
// JSON.stringify, que es exactamente lo que queremos: no mandar campos vacíos).
function hashField(raw: unknown, normalize: (v: string) => string): string[] | undefined {
  const value = asString(raw);
  if (!value) return undefined;
  if (isHashed(value)) return [value.toLowerCase()];
  const normalized = normalize(value);
  return normalized ? [sha256(normalized)] : undefined;
}

const lower = (v: string) => v.toLowerCase();
// Nombres/ciudades: minúsculas y sin espacios ni puntuación (spec de Meta).
const nameLike = (v: string) => v.toLowerCase().replace(/[^a-z0-9áéíóúñü]/g, "");
// Teléfono: solo dígitos, CON código de país y sin ceros a la izquierda.
const phoneLike = (v: string) => {
  const digits = v.replace(/\D/g, "").replace(/^0+/, "");
  return digits.length >= 8 ? digits : "";
};
// País: ISO-3166-1 alpha-2 en minúsculas ("AR" → "ar").
const countryLike = (v: string) => {
  const code = v.toLowerCase().replace(/[^a-z]/g, "");
  return code.length === 2 ? code : "";
};

// `contact` es el atajo cómodo del cliente: un solo string que puede ser email o
// teléfono. Lo clasificamos acá para no obligar al front a saber cuál mandó.
function splitContact(raw: unknown): { email?: string; phone?: string } {
  const value = asString(raw);
  if (!value) return {};
  return value.includes("@") ? { email: value } : { phone: value };
}

/* ============================================================ REQUEST
   Contexto que la CAPI usa para matchear el evento server-side con la persona. */

// x-forwarded-for viene como "clienteIp, proxy1, proxy2": Meta quiere UNA ip, la del
// cliente, que es la primera de la lista.
function clientIp(req: any): string | undefined {
  const raw = req.headers?.["x-forwarded-for"];
  const header = Array.isArray(raw) ? raw[0] : raw;
  const first = asString(header).split(",")[0].trim();
  return first || req.socket?.remoteAddress || undefined;
}

// sendBeacon puede llegar como Blob text/plain → Vercel deja el body como string.
// Si no parseamos eso, todos los eventos disparados con beacon se pierden en un 400.
function readBody(req: any): Record<string, any> {
  const body = req.body;
  if (!body) return {};
  if (typeof body === "string") {
    try {
      return JSON.parse(body);
    } catch {
      return {};
    }
  }
  if (Buffer.isBuffer(body)) {
    try {
      return JSON.parse(body.toString("utf8"));
    } catch {
      return {};
    }
  }
  return typeof body === "object" ? body : {};
}

/* ============================================================ HANDLER */

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const body = readBody(req);
  const { eventName, eventId } = body;
  if (!eventName || !eventId) {
    return res.status(400).json({ error: "eventName y eventId son requeridos" });
  }

  const pixelId = process.env.META_PIXEL_ID;
  const accessToken = process.env.META_ACCESS_TOKEN;
  if (!pixelId || !accessToken) {
    return res
      .status(500)
      .json({ error: "META_PIXEL_ID / META_ACCESS_TOKEN no están configuradas" });
  }

  const headers = req.headers || {};
  const contact = splitContact(body.contact);
  const user = body.userData || {};

  const em = hashField(user.email ?? contact.email, lower);
  const ph = hashField(user.phone ?? contact.phone, phoneLike);
  // external_id ata al mismo usuario entre eventos aunque no haya cookies. Si no lo
  // mandan, el hash del email sirve: es estable y ya lo tenemos.
  const externalId = hashField(user.externalId, lower) || em;

  const payload = {
    data: [
      {
        event_name: eventName,
        event_time: Math.floor(Date.now() / 1000),
        event_id: eventId,
        action_source: body.actionSource || "website",
        event_source_url:
          body.eventSourceUrl ||
          headers.referer ||
          (headers.host ? `https://${headers.host}/` : undefined),
        user_data: {
          client_ip_address: clientIp(req),
          client_user_agent: headers["user-agent"] || undefined,
          // _fbp (cookie del pixel) y _fbc (clic del anuncio) son los dos campos que
          // más levantan el match rate. Sin ellos la atribución cae feo.
          fbp: body.fbp || req.cookies?._fbp || undefined,
          fbc: body.fbc || req.cookies?._fbc || undefined,
          // Advanced Matching, todo SHA-256 (hex). Nada viaja en crudo a Meta.
          em,
          ph,
          external_id: externalId,
          fn: hashField(user.firstName, nameLike),
          ln: hashField(user.lastName, nameLike),
          ct: hashField(user.city, nameLike),
          st: hashField(user.state, nameLike),
          zp: hashField(user.zip, (v) => v.toLowerCase().replace(/\s/g, "")),
          country: hashField(user.country, countryLike),
        },
        // value/currency/content_name/... — obligatorio para Purchase, opcional para
        // el resto. Se manda tal cual lo arma el cliente.
        custom_data: body.customData || undefined,
      },
    ],
    // Con test_event_code el evento aparece en "Test Events" del Events Manager.
    // Dejalo VACÍO en producción o los eventos no cuentan para las campañas.
    test_event_code: body.testEventCode || process.env.META_TEST_EVENT_CODE || undefined,
  };

  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${pixelId}/events?access_token=${accessToken}`;

  try {
    const response = await postWithRetry(url, payload);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      // El detalle de Meta (fbtrace_id incluido) es lo único que sirve para debuggear
      // un rechazo, así que lo dejamos en los logs y en la respuesta.
      console.error("[CAPI] Meta rechazó el evento", eventName, JSON.stringify(data));
      return res.status(502).json({ success: false, meta: data });
    }
    return res.status(200).json({ success: true, meta: data });
  } catch (err: any) {
    console.error("[CAPI] fallo de red", eventName, err?.message);
    return res.status(500).json({ success: false, error: err?.message || "error" });
  }
}

// Un reintento ante error de red o 5xx de Meta. La CAPI falla de forma transitoria
// más seguido de lo que uno espera y perder el evento es perder la conversión.
async function postWithRetry(url: string, payload: unknown): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (response.status < 500) return response; // 2xx y 4xx: la respuesta es final
      lastError = new Error(`HTTP ${response.status}`);
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("CAPI request failed");
}
