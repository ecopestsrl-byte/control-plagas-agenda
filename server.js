const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PORT = process.env.PORT || 18766;
const ROOT = __dirname;
const PUBLIC = path.join(ROOT, "public");
const DATA = process.env.DATA_DIR || path.join(ROOT, "data");
const STORE_FILE = path.join(DATA, "storage.json");
const USERS_FILE = path.join(DATA, "users.json");
const SYSTEM_CONFIG_FILE = path.join(DATA, "system-config.json");
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
  const saved = readJson(SYSTEM_CONFIG_FILE, null);
  if (saved) return {
    name: saved.name || "CP Control Plagas",
    color: saved.color || "#0f6b4f",
    menuColor: saved.menuColor || "#102820",
    supervisor: saved.supervisor || "",
    logo: saved.logo || "",
    loginInitials: saved.loginInitials || "CP",
    loginTitle: saved.loginTitle || "Control Plagas",
    companyCode: saved.companyCode || "CP",
    loginBackground: saved.loginBackground || "#e9e9e9",
    loginBrandColor: saved.loginBrandColor || "#e2261c",
    loginButtonColor: saved.loginButtonColor || "#e2261c"
  };
  const adminStore = readJson(userStorageFile("admin"), readJson(STORE_FILE, {}));
  const config = adminStore.config || {};
  return {
    name: config.name || "CP Control Plagas",
    color: config.color || "#0f6b4f",
    menuColor: config.menuColor || "#102820",
    supervisor: config.supervisor || "",
    logo: config.logo || "",
    loginInitials: config.loginInitials || "CP",
    loginTitle: config.loginTitle || "Control Plagas",
    companyCode: config.companyCode || "CP",
    loginBackground: config.loginBackground || "#e9e9e9",
    loginBrandColor: config.loginBrandColor || "#e2261c",
    loginButtonColor: config.loginButtonColor || "#e2261c"
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
  if (users && users.length) {
    const oldOwner = users.find((item) => item.username === "dueno" && item.role === "owner");
    if (oldOwner && !users.some((item) => item.username === "propietario")) oldOwner.username = "propietario";
    users.forEach((item) => {
      if (item.username === "propietario") item.role = "owner";
      if (item.username === "admin" && item.role !== "owner") item.role = "admin";
    });
    if (!users.some((item) => item.role === "owner")) {
      users.unshift({ username: "propietario", passwordHash: hash("dueno123"), role: "owner" });
    }
    if (!users.some((item) => item.username === "admin")) {
      users.push({ username: "admin", passwordHash: hash("admin123"), role: "admin" });
    }
    writeJson(USERS_FILE, users);
    return users;
  }
  const initial = [
    { username: "propietario", passwordHash: hash("dueno123"), role: "owner" },
    { username: "admin", passwordHash: hash("admin123"), role: "admin" }
  ];
  writeJson(USERS_FILE, initial);
  return initial;
}

function isOwner(user) {
  return user && user.role === "owner";
}

function canConfigureSystem(user) {
  return user && (user.role === "owner" || user.role === "admin");
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
  const safePath = pathname.replace(/^\/+/, "");
  const file = path.normalize(path.join(PUBLIC, safePath));
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
    sessions.set(sid, { username: user.username, role: user.role || "user" });
    return send(res, 200, { ok: true, user: { username: user.username, role: user.role || "user" } }, "application/json", {
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

  if (url.pathname === "/api/system-config" && req.method === "POST") {
    if (!canConfigureSystem(user)) return send(res, 403, { ok: false, error: "No tienes permiso para modificar la configuracion del sistema" });
    const current = publicConfig();
    const next = { ...current, ...(body || {}) };
    writeJson(SYSTEM_CONFIG_FILE, next);
    return send(res, 200, { ok: true, config: next });
  }

  if (url.pathname === "/api/admin/users" && req.method === "GET") {
    if (!isOwner(user)) return send(res, 403, { ok: false, error: "Solo el propietario puede administrar usuarios" });
    const users = ensureUsers().map((item) => ({ username: item.username, role: item.role || "user" }));
    return send(res, 200, { ok: true, users });
  }

  if (url.pathname === "/api/admin/reset-user" && req.method === "POST") {
    if (!isOwner(user)) return send(res, 403, { ok: false, error: "Solo el propietario puede administrar usuarios" });
    const users = ensureUsers();
    let target = users.find((item) => item.username === body.currentUsername);
    const creating = !target;
    const newUsername = String(body.newUsername || target?.username || "").trim();
    if (!newUsername) return send(res, 400, { ok: false, error: "Escribe el usuario nuevo" });
    if (users.some((item) => item !== target && item.username === newUsername)) {
      return send(res, 400, { ok: false, error: "Ya existe un usuario con ese nombre" });
    }
    if (creating) {
      if (!body.newPassword) return send(res, 400, { ok: false, error: "Escribe una contrasena para crear el usuario" });
      target = { username: newUsername, passwordHash: hash(body.newPassword), role: "user" };
      users.push(target);
      writeJson(USERS_FILE, users);
      return send(res, 200, { ok: true, username: newUsername });
    }
    const oldUsername = target.username;
    const oldFile = userStorageFile(oldUsername);
    const newFile = userStorageFile(newUsername);
    target.username = newUsername;
    if (body.newPassword) target.passwordHash = hash(body.newPassword);
    writeJson(USERS_FILE, users);
    if (oldFile !== newFile && fs.existsSync(oldFile) && !fs.existsSync(newFile)) {
      fs.copyFileSync(oldFile, newFile);
    }
    sessions.forEach((session) => {
      if (session.username === oldUsername) session.username = newUsername;
    });
    return send(res, 200, { ok: true, username: newUsername });
  }

  if (url.pathname === "/api/change-credentials" && req.method === "POST") {
    const users = ensureUsers();
    const found = users.find((item) => item.username === user.username);
    if (!found || !verify(body.currentPassword, found.passwordHash)) {
      return send(res, 400, { ok: false, error: "La contrasena actual no coincide" });
    }
    const oldUsername = found.username;
    const newUsername = String(body.newUsername || found.username).trim() || found.username;
    const oldFile = userStorageFile(oldUsername);
    const newFile = userStorageFile(newUsername);
    found.username = newUsername;
    if (body.newPassword) found.passwordHash = hash(body.newPassword);
    writeJson(USERS_FILE, users);
    if (oldFile !== newFile && fs.existsSync(oldFile) && !fs.existsSync(newFile)) {
      fs.copyFileSync(oldFile, newFile);
    }
    sessions.forEach((session) => {
      if (session.username === oldUsername) session.username = found.username;
    });
    return send(res, 200, { ok: true, username: found.username });
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
