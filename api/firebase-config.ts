export const config = {
  runtime: "nodejs",
};

// Limpia valores pegados con comillas/comas de más (error típico al copiar el
// snippet de Firebase: `apiKey: "AIza...",` → la env var queda con comillas y
// coma literales y Firebase la rechaza como inválida).
function clean(v?: string) {
  if (typeof v !== "string") return v;
  return v
    .trim()
    .replace(/,\s*$/, "") // coma final
    .trim()
    .replace(/^["']|["']$/g, "") // comillas envolventes
    .trim();
}

// Sirve la config web de Firebase (valores PÚBLICOS: van al navegador).
// Se leen de las env vars de Vercel para no hardcodearlas en el bundle.
export default function handler(_req: any, res: any) {
  // Sin caché: la config es mínima y así evitamos servir valores viejos
  // mientras se corrige/valida (un cache largo nos hizo servir una key rota).
  res.setHeader("Cache-Control", "no-store");


  return res.status(200).json({
    apiKey: clean(process.env.apiKey),
    authDomain: clean(process.env.authDomain),
    projectId: clean(process.env.projectId),
    storageBucket: clean(process.env.storageBucket),
    messagingSenderId: clean(process.env.messagingSenderId),
    appId: clean(process.env.appId),
  });
}
