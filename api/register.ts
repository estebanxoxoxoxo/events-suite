import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

export const config = {
  runtime: "nodejs",
};

// Inicializa Firebase Admin una sola vez y reusa la instancia.
// (Mismo patrón que /api/failed-lead, que funciona de forma confiable.)
function getDb() {
  if (!getApps().length) {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!raw) throw new Error("FIREBASE_SERVICE_ACCOUNT no está configurada");
    initializeApp({ credential: cert(JSON.parse(raw)) });
    getFirestore().settings({ ignoreUndefinedProperties: true });
  }
  return getFirestore();
}

// Verificación del token de Google — BEST EFFORT.
// `firebase-admin/auth` se importa de forma dinámica y dentro de un try: si ese
// módulo falla al cargar en el runtime (lo que estaba crasheando la función con
// FUNCTION_INVOCATION_FAILED) o si verifyIdToken lanza, devolvemos null y NO
// rompemos el registro. El caller cae a los datos que manda el cliente.
async function verifyToken(idToken: string | undefined) {
  if (!idToken) return null;
  try {
    const { getAuth } = await import("firebase-admin/auth");
    // Guard de tiempo: si verifyIdToken se cuelga (cold start / fetch de certs),
    // no dejamos que la función muera por timeout — caemos al respaldo.
    const decoded: any = await Promise.race([
      getAuth().verifyIdToken(idToken),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("verify_timeout")), 4000)
      ),
    ]);
    return {
      uid: decoded.uid,
      email: decoded.email || null,
      emailVerified: decoded.email_verified || false,
      name: decoded.name || null,
      picture: decoded.picture || null,
    };
  } catch {
    return null;
  }
}

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const body = req.body || {};
    const source = typeof body.source === "string" ? body.source : "unknown";
    const attemptId = typeof body.attemptId === "string" ? body.attemptId : null;

    // Datos que manda el cliente (el usuario YA está autenticado por Google en
    // el navegador). Se usan como respaldo si la verificación server-side falla.
    const clientEmail = typeof body.email === "string" ? body.email : null;
    const clientUid = typeof body.uid === "string" ? body.uid : null;
    const clientName = typeof body.name === "string" ? body.name : null;
    const clientPicture = typeof body.picture === "string" ? body.picture : null;

    // Verificación server-side (best-effort).
    const verified = await verifyToken(body.idToken);

    const uid = verified?.uid || clientUid;
    const email = verified?.email || clientEmail;

    // Sin identidad no hay nada que guardar.
    if (!uid && !email) {
      return res.status(400).json({ error: "faltan datos del usuario" });
    }

    const lead = {
      uid: uid || null,
      email: email || null,
      emailVerified: verified?.emailVerified ?? false,
      name: verified?.name || clientName || null,
      picture: verified?.picture || clientPicture || null,
      provider: "google",
      verified: !!verified, // true = token verificado por el Admin SDK en el server
      source,
      ip: req.headers["x-forwarded-for"] || req.socket?.remoteAddress,
      country: req.headers["x-vercel-ip-country"] || null,
      region: req.headers["x-vercel-ip-country-region"] || null,
      city: req.headers["x-vercel-ip-city"]
        ? decodeURIComponent(String(req.headers["x-vercel-ip-city"]))
        : null,
      fbp: req.cookies?._fbp || null,
      fbc: req.cookies?._fbc || null,
      createdAt: FieldValue.serverTimestamp(),
    };

    // Upsert por uid (o email) → no duplica si el mismo usuario se registra otra vez.
    const docId = String(uid || email);
    await getDb().collection("leads").doc(docId).set(lead, { merge: true });

    // Completó → sacamos el intento "started"/fallido de failedLeads (queda solo
    // en `leads`).
    if (attemptId) {
      await getDb().collection("failedLeads").doc(attemptId).delete().catch(() => {});
    }

    return res
      .status(200)
      .json({ success: true, email: lead.email, verified: lead.verified });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || "error" });
  }
}
