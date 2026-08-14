// Echo de la metadata de sesión que el hosting adjunta al request en el edge:
// geo/IP viajan como headers x-vercel-ip-* que el navegador no puede ver por
// sí mismo — este endpoint se los devuelve, identificando al proveedor en
// `supplier`. Sin dependencias, sin estado, sin data de deployment.

const header = (req: { headers: Record<string, string | string[]> }, name: string) => {
  const value = req.headers[name];
  return Array.isArray(value) ? value[0] : value || undefined;
};

const decoded = (value: string | undefined) => {
  if (!value) return undefined;
  try {
    return decodeURIComponent(value); // Vercel manda p. ej. la ciudad URL-encoded
  } catch {
    return value;
  }
};

export default function handler(req: { headers: Record<string, string | string[]> }, res: { setHeader: (key: string, value: string) => void; status: (code: number) => { json: (data: any) => void } }) {
  const forwarded = header(req, 'x-forwarded-for');
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({
    supplier: 'vercel',
    ip: header(req, 'x-real-ip') || (forwarded ? forwarded.split(',')[0].trim() : undefined),
    country: header(req, 'x-vercel-ip-country'),
    region: decoded(header(req, 'x-vercel-ip-country-region')),
    city: decoded(header(req, 'x-vercel-ip-city')),
    postal_code: header(req, 'x-vercel-ip-postal-code'),
    latitude: header(req, 'x-vercel-ip-latitude'),
    longitude: header(req, 'x-vercel-ip-longitude'),
    timezone: header(req, 'x-vercel-ip-timezone'),
  });
}
