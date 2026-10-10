import crypto from "crypto";

const DAYS = 7;
const b64 = (s) => Buffer.from(s).toString("base64url");

function secret() {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error("AUTH_SECRET is not set in backend/.env");
  return s;
}

function sign(data) {
  return crypto.createHmac("sha256", secret()).update(data).digest("base64url");
}

function makeToken(user) {
  const payload = b64(JSON.stringify({ u: user, exp: Date.now() + DAYS * 86400000 }));
  return payload + "." + sign(payload);
}

function verifyToken(token) {
  if (!token) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const a = Buffer.from(sig);
  const b = Buffer.from(sign(payload));
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString());
    return data.exp > Date.now() ? data : null;
  } catch {
    return null;
  }
}

function safeEqual(x, y) {
  const hx = crypto.createHash("sha256").update(String(x)).digest();
  const hy = crypto.createHash("sha256").update(String(y)).digest();
  return crypto.timingSafeEqual(hx, hy);
}

// Block guessing: 10 wrong tries per 15 minutes per device
const attempts = new Map();
const WINDOW = 15 * 60 * 1000;

export function login(req, res) {
  const ip = req.ip;
  const now = Date.now();
  const recent = (attempts.get(ip) || []).filter((t) => now - t < WINDOW);
  if (recent.length >= 10) {
    return res.status(429).json({ error: "Too many attempts. Try again in 15 minutes." });
  }

  const okUser = process.env.AUTH_USERNAME;
  const okPass = process.env.AUTH_PASSWORD;
  if (!okUser || !okPass) {
    return res.status(500).json({ error: "Login is not set up on the server." });
  }

  const { username, password } = req.body || {};
  const userMatch = safeEqual(username || "", okUser);
  const passMatch = safeEqual(password || "", okPass);

  if (userMatch && passMatch) {
    attempts.delete(ip);
    return res.json({ token: makeToken(okUser) });
  }

  recent.push(now);
  attempts.set(ip, recent);
  return res.status(401).json({ error: "Wrong username or password." });
}

export function requireAuth(req, res, next) {
  if (req.method === "OPTIONS") return next();
  if (req.path === "/login" || req.path === "/health") return next();
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!verifyToken(token)) return res.status(401).json({ error: "Please log in." });
  next();
}
