import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

export const config = {
  runtime: "nodejs",
};

// Inicializa Firebase Admin una sola vez y reusa la instancia.
function getDb() {
  if (!getApps().length) {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!raw) throw new Error("FIREBASE_SERVICE_ACCOUNT no está configurada");
    initializeApp({ credential: cert(JSON.parse(raw)) });
    getFirestore().settings({ ignoreUndefinedProperties: true });
  }
  return getFirestore();
}

// Registra un intento de registro que NO terminó OK. Se usa en dos momentos,
// upserteando por `attemptId` (el mismo doc):
//   1) reason "started": apenas se toca "Registrarse" (con keepalive, así llega
//      aunque cierren la pestaña enseguida) → captura al que abandona en silencio.
//   2) reason real (auth/popup-closed-by-user, etc.): si el flujo falla explícito.
// Si el registro completa, /api/register borra este doc (queda solo en `leads`).
export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const body = req.body || {};
    const attemptId = typeof body.attemptId === "string" ? body.attemptId : null;
    const source = typeof body.source === "string" ? body.source : "unknown";
    const reason = typeof body.reason === "string" ? body.reason : "unknown";
    const message = typeof body.message === "string" ? body.message : null;

    const data: any = {
      source,
      reason, // "started" | auth/popup-closed-by-user | auth/user-cancelled | ...
      message,
      email: typeof body.email === "string" ? body.email : null,
      ip: req.headers["x-forwarded-for"] || req.socket?.remoteAddress,
      userAgent: req.headers["user-agent"],
      country: req.headers["x-vercel-ip-country"] || null,
      region: req.headers["x-vercel-ip-country-region"] || null,
      city: req.headers["x-vercel-ip-city"]
        ? decodeURIComponent(String(req.headers["x-vercel-ip-city"]))
        : null,
      fbp: req.cookies?._fbp || null,
      fbc: req.cookies?._fbc || null,
      referer: req.headers?.referer || null,
      updatedAt: FieldValue.serverTimestamp(),
    };
    // createdAt solo en la primera escritura ("started"); las actualizaciones
    // (mergear el motivo real) no lo pisan.
    if (reason === "started" || !attemptId) {
      data.createdAt = FieldValue.serverTimestamp();
    }

    const col = getDb().collection("failedLeads");
    if (attemptId) {
      await col.doc(attemptId).set(data, { merge: true });
    } else {
      await col.add(data);
    }

    return res.status(200).json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
}
