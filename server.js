const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PORT = process.env.PORT || 8080;
const ROOT = __dirname;
const PUBLIC = path.join(ROOT, "public");
const DATA = path.join(ROOT, "data");
const STORE_FILE = path.join(DATA, "storage.json");
const USERS_FILE = path.join(DATA, "users.json");
const sessions = new Map();

fs.mkdirSync(DATA, { recursive: true });

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJson(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
}

function userStorageFile(username) {
  const safe = String(username || "default").replace(/[^a-z0-9_-]/gi, "_").toLowerCase();
  return path.join(DATA, `storage-${safe}.json`);
}

function publicConfig() {
  const adminStore = readJson(userStorageFile("admin"), readJson(STORE_FILE, {}));
  const config = adminStore.config || {};
  return {
    name: config.name || "CP Control Plagas",
    loginInitials: config.loginInitials || "CP",
    loginTitle: config.loginTitle || "Control Plagas",
    companyCode: config.companyCode || "CP"
  };
}

function hash(password, salt = crypto.randomBytes(16).toString("hex")) {
  const value = crypto.scryptSync(String(password), salt, 64).toString("hex");
  return `${salt}:${value}`;
}

function verify(password, stored) {
  const [salt] = String(stored || "").split(":");
  return stored === hash(password, salt);
}

function ensureUsers() {
  const users = readJson(USERS_FILE, null);
  if (users && users.length) return users;
  const initial = [{ username: "admin", passwordHash: hash("admin123"), role: "admin" }];
  writeJson(USERS_FILE, initial);
  return initial;
}

function getCookies(req) {
  return Object.fromEntries(String(req.headers.cookie || "").split(";").filter(Boolean).map((part) => {
    const [key, ...rest] = part.trim().split("=");
    return [key, decodeURIComponent(rest.join("="))];
  }));
}

function currentUser(req) {
  const sid = getCookies(req).sid;
  return sid ? sessions.get(sid) : null;
}

function send(res, status, body, type = "application/json", headers = {}) {
  const payload = type === "application/json" ? JSON.stringify(body) : body;
  res.writeHead(status, { "Content-Type": type, ...headers });
  res.end(payload);
}

function readBody(req) {
  return new Promise((resolve) => {
    let body = "";
    req.on("data", (chunk) => body += chunk);
    req.on("end", () => {
      try { resolve(JSON.parse(body || "{}")); } catch { resolve({}); }
    });
  });
}

function contentType(file) {
  const ext = path.extname(file).toLowerCase();
  return {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".svg": "image/svg+xml"
  }[ext] || "application/octet-stream";
}

function serveFile(req, res) {
  const user = currentUser(req);
  const url = new URL(req.url, `http://${req.headers.host}`);
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === "/") pathname = user ? "/index.html" : "/login.html";
  if (!user && pathname !== "/login.html" && !pathname.startsWith("/api/")) {
    res.writeHead(302, { Location: "/login.html" });
    return res.end();
  }
  const file = path.normalize(path.join(PUBLIC, pathname));
  if (!file.startsWith(PUBLIC)) return send(res, 403, "Forbidden", "text/plain");
  fs.readFile(file, (err, data) => {
    if (err) return send(res, 404, "No encontrado", "text/plain");
    send(res, 200, data, contentType(file));
  });
}

async function handleApi(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const body = req.method === "POST" ? await readBody(req) : {};

  if (url.pathname === "/api/public-config" && req.method === "GET") {
    return send(res, 200, { ok: true, config: publicConfig() });
  }

  if (url.pathname === "/api/login" && req.method === "POST") {
    const config = publicConfig();
    if (config.companyCode && String(body.companyCode || "").trim().toLowerCase() !== String(config.companyCode).trim().toLowerCase()) {
      return send(res, 401, { ok: false, error: "Codigo de compania incorrecto" });
    }
    const users = ensureUsers();
    const user = users.find((item) => item.username === body.username);
    if (!user || !verify(body.password, user.passwordHash)) {
      return send(res, 401, { ok: false, error: "Usuario o contrasena incorrectos" });
    }
    const sid = crypto.randomBytes(24).toString("hex");
    sessions.set(sid, { username: user.username, role: user.role || "admin" });
    return send(res, 200, { ok: true, user: { username: user.username } }, "application/json", {
      "Set-Cookie": `sid=${sid}; Path=/; HttpOnly; SameSite=Lax`
    });
  }

  if (url.pathname === "/api/logout" && req.method === "POST") {
    const sid = getCookies(req).sid;
    if (sid) sessions.delete(sid);
    return send(res, 200, { ok: true }, "application/json", {
      "Set-Cookie": "sid=; Path=/; Max-Age=0"
    });
  }

  const user = currentUser(req);
  if (!user) return send(res, 401, { ok: false, error: "No autorizado" });

  if (url.pathname === "/api/me") return send(res, 200, { ok: true, user });

  if (url.pathname === "/api/change-credentials" && req.method === "POST") {
    const users = ensureUsers();
    const found = users.find((item) => item.username === user.username);
    if (!found || !verify(body.currentPassword, found.passwordHash)) {
      return send(res, 400, { ok: false, error: "La contrasena actual no coincide" });
    }
    found.username = String(body.newUsername || found.username).trim() || found.username;
    if (body.newPassword) found.passwordHash = hash(body.newPassword);
    writeJson(USERS_FILE, users);
    sessions.forEach((session) => {
      if (session.username === user.username) session.username = found.username;
    });
    return send(res, 200, { ok: true });
  }

  if (url.pathname === "/api/storage" && req.method === "GET") {
    const file = userStorageFile(user.username);
    const fallback = readJson(STORE_FILE, {});
    return send(res, 200, readJson(file, fallback));
  }

  if (url.pathname === "/api/storage" && req.method === "POST") {
    writeJson(userStorageFile(user.username), body || {});
    return send(res, 200, { ok: true });
  }

  send(res, 404, { ok: false, error: "Ruta no encontrada" });
}

const server = http.createServer((req, res) => {
  if (req.url.startsWith("/api/")) handleApi(req, res);
  else serveFile(req, res);
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Sistema listo en http://localhost:${PORT}`);
});
