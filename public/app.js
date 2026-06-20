const $ = (id) => document.getElementById(id);
const today = () => new Date().toISOString().slice(0, 10);
let state = { technicians: [], services: [], recurring: [], reports: {}, sentTechs: {}, config: { name: "CP Control Plagas", color: "#0f6b4f", supervisor: "", logo: "", loginInitials: "CP", loginTitle: "Control Plagas", companyCode: "CP", loginBackground: "#e9e9e9", loginBrandColor: "#e2261c", loginButtonColor: "#e2261c" } };
const defaultTechnicians = [
  { id: "iv9rd7qwmqlejbk3", name: "DAYNEL ENCARNACION", phone: "+1 8099954601", zone: "General", base: "" },
  { id: "tcb7z1ikmqmcvoa8", name: "Antonio De Jesus Mateo", phone: "+1 8099580851", zone: "General", base: "" },
  { id: "xfc3d296mqmcuwki", name: "JESUS SURIEL", phone: "+1 8097089381", zone: "General", base: "" }
];

async function api(path, data) {
  const options = data === undefined ? {} : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) };
  const res = await fetch(path, options);
  if (res.status === 401) location.href = "/login.html";
  return res.json();
}

async function load() {
  const me = await api("/api/me");
  $("userBadge").textContent = me.user?.username || "";
  state = { ...state, ...(await api("/api/storage")) };
  state.sentTechs = state.sentTechs || {};
  if (!state.technicians || !state.technicians.length) state.technicians = [...defaultTechnicians];
  $("serviceDate").value = today();
  $("reportDate").value = today();
  applyConfig();
  renderAll();
  save();
}

async function save() {
  await api("/api/storage", state);
  renderAll();
}

function toast(msg) {
  $("toast").textContent = msg;
  $("toast").style.display = "block";
  setTimeout(() => $("toast").style.display = "none", 2600);
}

function uid() { return Math.random().toString(36).slice(2, 10) + Date.now().toString(36); }
function cleanPhone(value) {
  const raw = String(value || "").match(/(?:\+?1[\s().-]*)?(?:8[024]9|809)[\s().-]*\d{3}[\s.-]*\d{4}/);
  return raw ? raw[0].replace(/\D/g, "").replace(/^1(?=8)/, "1") : "";
}
function cleanDate(value) {
  const m = String(value || "").match(/(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})/);
  if (!m) return today();
  const y = m[3].length === 2 ? `20${m[3]}` : m[3];
  return `${y}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
}
function displayDate(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}
function timeFromText(value) {
  const m = String(value || "").match(/(\d{1,2})\s*[: ]\s*(\d{2})?\s*(AM|PM)\b/i);
  if (!m) return { time: "09:00", ampm: "AM", label: "9:00 AM" };
  let h = Number(m[1]);
  const min = (m[2] || "00").padStart(2, "0");
  const ampm = m[3].toUpperCase();
  const label = `${h}:${min} ${ampm}`;
  if (ampm === "PM" && h < 12) h += 12;
  if (ampm === "AM" && h === 12) h = 0;
  return { time: `${String(h).padStart(2, "0")}:${min}`, ampm, label };
}
function labelTime(service) {
  if (service.timeLabel) return service.timeLabel;
  const [h0, min] = String(service.time || "09:00").split(":");
  let h = Number(h0), ampm = service.ampm || (h >= 12 ? "PM" : "AM");
  if (h === 0) h = 12;
  if (h > 12) h -= 12;
  return `${h}:${min || "00"} ${ampm}`;
}
function detectZone(text) {
  const upper = String(text || "").toUpperCase();
  if (upper.includes("SANTIAGO")) return "Santiago";
  if (upper.includes("SANTO DOMINGO") || upper.includes("PIANTINI") || upper.includes("DUARTE")) return "Santo Domingo";
  return "General";
}
function normalizeServiceText(text) {
  return String(text || "").replace(/\s+/g, " ").replace(/\s+\./g, ".").trim();
}
function splitNotes(text) {
  const clean = normalizeServiceText(text);
  const m = clean.match(/\b(OJO:|NOTA:|Nota:)\s*(.+)$/i);
  if (!m) return { service: clean, note: "" };
  return { service: clean.slice(0, m.index).trim(), note: m[0].trim() };
}

function parseWhatsApp(text) {
  const blocks = String(text || "").split(/\n\s*\n/).map((x) => x.trim()).filter(Boolean);
  return blocks.map((block) => {
    const map = block.match(/https?:\/\/maps\.app\.goo\.gl\/\S+/i)?.[0]?.replace(/[.,]$/, "") || "";
    const phone = cleanPhone(block);
    const date = cleanDate(block);
    const t = timeFromText(block);
    let rest = block.replace(map, " ").replace(/\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}/, " ").replace(/(\d{1,2})\s*[: ]\s*(\d{2})?\s*(AM|PM)\b\.?/i, " ");
    if (phone) rest = rest.replace(/(?:\+?1[\s().-]*)?(?:8[024]9|809)[\s().-]*\d{3}[\s.-]*\d{4}/, " ");
    rest = normalizeServiceText(rest);
    const serviceStart = rest.search(/\b(FUMIGACION|FUMIGACIÓN|CONTROL|TRATAMIENTO|MANTENIMIENTO|DESINSECTACION|DESRATIZACION)\b/i);
    const before = serviceStart >= 0 ? rest.slice(0, serviceStart).trim() : rest;
    const after = serviceStart >= 0 ? rest.slice(serviceStart).trim() : "Servicio pendiente de revisar";
    const pieces = before.split(/\s{2,}|,\s*/).filter(Boolean);
    const client = (pieces[0] || before || "Cliente sin nombre").trim();
    const address = before.replace(client, "").trim() || client;
    const notes = splitNotes(after);
    const zone = detectZone(`${before} ${after}`);
    const zoneText = zone !== "General" && !notes.service.toUpperCase().includes(zone.toUpperCase()) ? ` / ${zone.toUpperCase()}` : "";
    return { id: uid(), client, phone, date, time: t.time, ampm: t.ampm, timeLabel: t.label, zone, address, map, service: `${notes.service}${zoneText}`, note: notes.note, techId: "", supportTechId: "" };
  });
}

function applyConfig() {
  state.config = { loginInitials: "CP", loginTitle: "Control Plagas", companyCode: "CP", loginBackground: "#e9e9e9", loginBrandColor: "#e2261c", loginButtonColor: "#e2261c", ...(state.config || {}) };
  document.documentElement.style.setProperty("--brand", state.config.color || "#0f6b4f");
  $("brandName").textContent = state.config.name || "CP Control Plagas";
  $("cfgName").value = state.config.name || "";
  $("cfgColor").value = state.config.color || "#0f6b4f";
  $("cfgSupervisor").value = state.config.supervisor || "";
  $("cfgLoginInitials").value = state.config.loginInitials || "CP";
  $("cfgLoginTitle").value = state.config.loginTitle || "Control Plagas";
  $("cfgCompanyCode").value = state.config.companyCode || "CP";
  $("cfgLoginBackground").value = state.config.loginBackground || "#e9e9e9";
  $("cfgLoginBrandColor").value = state.config.loginBrandColor || "#e2261c";
  $("cfgLoginButtonColor").value = state.config.loginButtonColor || "#e2261c";
  if (state.config.logo) {
    $("logoPreview").src = state.config.logo;
    $("logoPreview").style.display = "block";
  }
}

function renderAll() {
  renderTechOptions();
  renderTechs();
  renderServices();
  renderRoutes();
  renderRecurring();
  renderReports();
  applyConfig();
}

function renderTechOptions() {
  const opts = ['<option value="">Sin asignar</option>'].concat(state.technicians.map(t => `<option value="${t.id}">${t.name}</option>`)).join("");
  $("assignedTech").innerHTML = opts;
  $("supportTech").innerHTML = '<option value="">Sin acompanante</option>' + state.technicians.map(t => `<option value="${t.id}">${t.name}</option>`).join("");
}

function techOptions(selected, blankText = "Sin asignar") {
  return `<option value="">${blankText}</option>` + state.technicians.map(t => `<option value="${t.id}" ${t.id === selected ? "selected" : ""}>${t.name}</option>`).join("");
}

function markPendingForService(service) {
  state.sentTechs = state.sentTechs || {};
  if (service.techId) delete state.sentTechs[service.techId];
  if (service.supportTechId) delete state.sentTechs[service.supportTechId];
}

function markSent(techId) {
  state.sentTechs = state.sentTechs || {};
  state.sentTechs[techId] = new Date().toISOString();
}

function techStatus(techId) {
  return state.sentTechs?.[techId] ? "Completado" : "Pendiente";
}

function renderTechs() {
  $("techList").innerHTML = state.technicians.map(t => `<div class="item"><div class="item-head"><strong>${t.name}</strong><span class="pill">${t.zone}</span></div><div class="muted">${t.phone || "Sin WhatsApp"} · ${t.base || "Sin base"}</div><div class="actions"><button class="secondary" onclick="editTech('${t.id}')">Editar</button><button class="danger" onclick="deleteTech('${t.id}')">Eliminar</button></div></div>`).join("") || "<p class='muted'>No hay tecnicos registrados.</p>";
}

function serviceCard(s, report = false) {
  const tech = state.technicians.find(t => t.id === s.techId);
  const support = state.technicians.find(t => t.id === s.supportTechId);
  const assignment = `<div class="assignment-row">
    <label>Tecnico principal<select onchange="updateServiceTech('${s.id}', this.value, 'main')">${techOptions(s.techId)}</select></label>
    <label>Tecnico acompanante<select onchange="updateServiceTech('${s.id}', this.value, 'support')">${techOptions(s.supportTechId, "Sin acompanante")}</select></label>
  </div>`;
  const noteEditor = `<div class="quick-note">
    <label>Nota del servicio<textarea id="quickNote-${s.id}" placeholder="Agregar nota para el tecnico">${s.note || ""}</textarea></label>
    <button class="secondary" onclick="saveServiceNote('${s.id}')">Guardar nota</button>
  </div>`;
  return `<div class="item"><div class="item-head"><strong>${s.client} - ${labelTime(s)}</strong><span class="pill">${s.zone || "General"}</span></div>
  <div>${displayDate(s.date)} · ${tech ? tech.name : "Sin tecnico"}${support ? " con " + support.name : ""}</div>
  <div class="muted">${s.phone || "Sin telefono"} · ${s.address || "Sin direccion"}</div>
  <div>${s.service || "Servicio pendiente"}</div>${s.note ? `<div><strong>Nota:</strong> ${s.note}</div>` : ""}
  ${report ? "" : `${assignment}${noteEditor}<div class="actions"><button class="secondary" onclick="editService('${s.id}')">Editar completo</button><button class="danger" onclick="deleteService('${s.id}')">Eliminar</button></div>`}</div>`;
}

function renderServices() {
  $("serviceList").innerHTML = state.services.sort((a,b) => (a.date + a.time).localeCompare(b.date + b.time)).map(s => serviceCard(s)).join("") || "<p class='muted'>No hay servicios activos.</p>";
}

function renderRoutes() {
  $("routesList").innerHTML = state.technicians.map(t => {
    const list = state.services.filter(s => s.techId === t.id || s.supportTechId === t.id).sort((a,b) => a.time.localeCompare(b.time));
    const statusClass = state.sentTechs?.[t.id] ? "done" : "pending";
    return `<div class="item route-card">
      <div class="item-head"><strong>${t.name}</strong><span class="status ${statusClass}">${techStatus(t.id)}</span></div>
      <div class="muted">${list.length} servicio(s) asignado(s)</div>
      ${list.map(s => `<div class="route-service">${s.client} - ${labelTime(s)}<br><span class="muted">${s.address || ""}</span></div>`).join("") || "<span class='muted'>Sin servicios asignados.</span>"}
      <div class="actions"><button class="secondary" onclick="sendOneTechWhatsapp('${t.id}')" ${list.length ? "" : "disabled"}>Enviar WhatsApp</button><button class="secondary" onclick="markTechPending('${t.id}')" ${state.sentTechs?.[t.id] ? "" : "disabled"}>Marcar pendiente</button></div>
    </div>`;
  }).join("") || "<p class='muted'>Registra tecnicos para ver rutas.</p>";
}

function renderRecurring() {
  $("recurringList").innerHTML = state.recurring.map(r => `<div class="item"><div class="item-head"><strong>${r.client}</strong><span class="pill">${displayDate(r.date)}</span></div><div class="muted">${r.phone || ""} · cada ${r.freq} dias</div><div>${r.service || ""}</div><div class="actions"><button class="secondary" onclick="editRecurring('${r.id}')">Editar</button><button class="danger" onclick="deleteRecurring('${r.id}')">Eliminar</button></div></div>`).join("") || "<p class='muted'>No hay clientes fijos.</p>";
}

function renderReports() {
  const date = $("reportDate").value || today();
  const items = (state.reports[date] || []).concat(state.services.filter(s => s.date === date));
  $("reportList").innerHTML = items.map(s => serviceCard(s, true)).join("") || "<p class='muted'>No hay servicios para esta fecha.</p>";
}

function autoAssign() {
  let i = 0;
  state.services.forEach(s => {
    if (s.techId) return;
    const candidates = state.technicians.filter(t => t.zone === "General" || s.zone === "General" || t.zone === s.zone);
    if (candidates.length) {
      s.techId = candidates[i++ % candidates.length].id;
      markPendingForService(s);
    }
  });
  save();
  toast("Servicios asignados automaticamente.");
}

function techMessage(tech) {
  const date = new Date().toLocaleDateString("es-DO", { weekday: "long", day: "numeric", month: "long" });
  const list = state.services.filter(s => s.techId === tech.id || s.supportTechId === tech.id).sort((a,b) => a.time.localeCompare(b.time));
  const lines = [`Hola ${tech.name}, esta es tu agenda confirmada para ${date}:`];
  list.forEach((s, idx) => {
    const support = state.technicians.find(t => (s.techId === tech.id ? s.supportTechId : s.techId) === t.id);
    lines.push("", `${idx + 1}. ${s.client} - ${labelTime(s)}`);
    if (support) lines.push(`Tecnico acompanante: ${support.name}`);
    lines.push(`Fecha: ${displayDate(s.date)}`, `Telefono cliente: ${s.phone || "Sin telefono"}`, `Direccion: ${s.address || "Sin direccion"}`, `Mapa: ${s.map || "Sin link de mapa"}`, `Servicio: ${s.service || "Servicio pendiente de revisar"}`);
    if (s.note) lines.push(`Nota: ${s.note}`);
  });
  lines.push("", "Por favor confirma recibido y avisa cualquier novedad.");
  return lines.join("\n");
}

function openWhatsApp(phone, message) {
  const clean = cleanPhone(phone);
  if (!clean) return toast("Falta el numero de WhatsApp.");
  window.open(`https://wa.me/${clean}?text=${encodeURIComponent(message)}`, "_blank");
}

document.querySelectorAll(".nav button[data-view]").forEach(btn => btn.addEventListener("click", () => {
  document.querySelectorAll(".nav button").forEach(b => b.classList.remove("active"));
  btn.classList.add("active");
  document.querySelectorAll(".view").forEach(v => v.classList.add("hidden"));
  $(btn.dataset.view).classList.remove("hidden");
  $("pageTitle").textContent = btn.textContent === "Agenda" ? "Agenda y asignacion de servicios" : btn.textContent;
  renderAll();
}));

$("logoutBtn").onclick = async () => { await api("/api/logout", {}); location.href = "/login.html"; };
$("autoAssignBtn").onclick = autoAssign;
$("organizeBtn").onclick = () => { state.services.push(...parseWhatsApp($("bulkText").value)); autoAssign(); };
$("parseBtn").onclick = () => { state.services.push(...parseWhatsApp($("bulkText").value)); save(); toast("Informacion organizada."); };
$("resetDayBtn").onclick = () => {
  const active = state.services.filter(s => s.date === today());
  if (active.length) state.reports[today()] = (state.reports[today()] || []).concat(active);
  state.services = state.services.filter(s => s.date !== today());
  save();
  toast("Servicios del dia reiniciados y guardados en reportes.");
};
$("sendTechWhatsappBtn").onclick = () => state.technicians.forEach(t => {
  if (state.services.some(s => s.techId === t.id || s.supportTechId === t.id)) {
    openWhatsApp(t.phone, techMessage(t));
    markSent(t.id);
  }
  save();
});
$("sendSupervisorSummaryBtn").onclick = () => {
  const msg = state.services.map(s => `${s.client} - ${labelTime(s)} - ${state.technicians.find(t => t.id === s.techId)?.name || "Sin tecnico"}`).join("\n");
  openWhatsApp(state.config.supervisor, `Alertas de servicios asignados:\n\n${msg}`);
};

$("techForm").onsubmit = (e) => {
  e.preventDefault();
  const item = { id: $("techId").value || uid(), name: $("techName").value, phone: $("techPhone").value, zone: $("techZone").value, base: $("techBase").value };
  state.technicians = state.technicians.filter(t => t.id !== item.id).concat(item);
  e.target.reset(); $("techId").value = ""; save();
};
$("clearTechBtn").onclick = () => { $("techForm").reset(); $("techId").value = ""; };
window.editTech = (id) => { const t = state.technicians.find(x => x.id === id); if (!t) return; $("techId").value=t.id; $("techName").value=t.name; $("techPhone").value=t.phone; $("techZone").value=t.zone; $("techBase").value=t.base; };
window.deleteTech = (id) => { state.technicians = state.technicians.filter(t => t.id !== id); save(); };

window.updateServiceTech = (serviceId, techId, role) => {
  const service = state.services.find(s => s.id === serviceId);
  if (!service) return;
  if (role === "main") service.techId = techId;
  if (role === "support") service.supportTechId = techId;
  if (service.techId && service.supportTechId && service.techId === service.supportTechId) {
    service.supportTechId = "";
    toast("El tecnico principal y acompanante no pueden ser el mismo.");
  }
  markPendingForService(service);
  save();
  toast("Asignacion actualizada.");
};

window.sendOneTechWhatsapp = (techId) => {
  const tech = state.technicians.find(t => t.id === techId);
  if (!tech) return;
  if (!state.services.some(s => s.techId === tech.id || s.supportTechId === tech.id)) {
    toast("Ese tecnico no tiene servicios asignados.");
    return;
  }
  openWhatsApp(tech.phone, techMessage(tech));
  markSent(tech.id);
  save();
};

window.markTechPending = (techId) => {
  state.sentTechs = state.sentTechs || {};
  delete state.sentTechs[techId];
  save();
};

window.saveServiceNote = (serviceId) => {
  const service = state.services.find(s => s.id === serviceId);
  const input = $(`quickNote-${serviceId}`);
  if (!service || !input) return;
  service.note = input.value.trim();
  markPendingForService(service);
  save();
  toast("Nota guardada. El tecnico queda pendiente de nuevo.");
};

$("serviceForm").onsubmit = (e) => {
  e.preventDefault();
  const [h0, min] = $("serviceTime").value.split(":");
  let h = Number(h0);
  if ($("serviceAmPm").value === "PM" && h < 12) h += 12;
  if ($("serviceAmPm").value === "AM" && h === 12) h = 0;
  const item = { id: $("serviceId").value || uid(), client: $("clientName").value, date: $("serviceDate").value, time: `${String(h).padStart(2,"0")}:${min}`, ampm: $("serviceAmPm").value, timeLabel: `${Number(h0)}:${min} ${$("serviceAmPm").value}`, phone: $("clientPhone").value, zone: $("serviceZone").value, techId: $("assignedTech").value, supportTechId: $("supportTech").value, address: $("address").value, map: $("mapLink").value, service: $("serviceDesc").value, note: $("note").value };
  markPendingForService(item);
  state.services = state.services.filter(s => s.id !== item.id).concat(item);
  e.target.reset(); $("serviceId").value = ""; $("serviceDate").value = today(); save();
};
$("clearServiceBtn").onclick = () => { $("serviceForm").reset(); $("serviceDate").value = today(); $("serviceId").value = ""; };
window.editService = (id) => { const s = state.services.find(x => x.id === id); if (!s) return; $("serviceId").value=s.id; $("clientName").value=s.client; $("serviceDate").value=s.date; $("serviceTime").value=s.time; $("serviceAmPm").value=s.ampm || "AM"; $("clientPhone").value=s.phone; $("serviceZone").value=s.zone; $("assignedTech").value=s.techId; $("supportTech").value=s.supportTechId; $("address").value=s.address; $("mapLink").value=s.map; $("serviceDesc").value=s.service; $("note").value=s.note; };
window.deleteService = (id) => { state.services = state.services.filter(s => s.id !== id); save(); };

$("recurringForm").onsubmit = (e) => {
  e.preventDefault();
  const item = { id: $("recurringId").value || uid(), client: $("recClient").value, phone: $("recPhone").value, date: $("recDate").value, freq: $("recFreq").value, address: $("recAddress").value, map: $("recMap").value, service: $("recService").value };
  state.recurring = state.recurring.filter(r => r.id !== item.id).concat(item);
  e.target.reset(); $("recurringId").value = ""; save();
};
$("generateRecurringBtn").onclick = () => {
  state.recurring.filter(r => r.date <= today()).forEach(r => state.services.push({ id: uid(), client: r.client, phone: r.phone, date: r.date, time: "09:00", ampm: "AM", timeLabel: "9:00 AM", zone: detectZone(r.address), address: r.address, map: r.map, service: r.service, note: "", techId: "", supportTechId: "" }));
  save();
};
window.editRecurring = (id) => { const r = state.recurring.find(x => x.id === id); if (!r) return; $("recurringId").value=r.id; $("recClient").value=r.client; $("recPhone").value=r.phone; $("recDate").value=r.date; $("recFreq").value=r.freq; $("recAddress").value=r.address; $("recMap").value=r.map; $("recService").value=r.service; };
window.deleteRecurring = (id) => { state.recurring = state.recurring.filter(r => r.id !== id); save(); };

$("reportDate").onchange = renderReports;
$("printReportBtn").onclick = () => window.print();
$("deleteReportBtn").onclick = () => { delete state.reports[$("reportDate").value]; save(); };
$("deleteAllReportsBtn").onclick = () => { if (confirm("Eliminar todos los reportes?")) { state.reports = {}; save(); } };
$("configForm").onsubmit = (e) => {
  e.preventDefault();
  state.config.name = $("cfgName").value;
  state.config.color = $("cfgColor").value;
  state.config.supervisor = $("cfgSupervisor").value;
  state.config.loginInitials = $("cfgLoginInitials").value.trim() || "CP";
  state.config.loginTitle = $("cfgLoginTitle").value.trim() || "Control Plagas";
  state.config.companyCode = $("cfgCompanyCode").value.trim() || "CP";
  state.config.loginBackground = $("cfgLoginBackground").value || "#e9e9e9";
  state.config.loginBrandColor = $("cfgLoginBrandColor").value || "#e2261c";
  state.config.loginButtonColor = $("cfgLoginButtonColor").value || "#e2261c";
  save();
  toast("Configuracion guardada. El login usara esos datos.");
};
$("cfgLogo").onchange = () => {
  const file = $("cfgLogo").files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => { state.config.logo = reader.result; save(); };
  reader.readAsDataURL(file);
};
$("credentialsForm").onsubmit = async (e) => {
  e.preventDefault();
  const data = await api("/api/change-credentials", { newUsername: $("newUsername").value, currentPassword: $("currentPassword").value, newPassword: $("newPassword").value });
  if (data.ok) {
    $("userBadge").textContent = data.username || $("newUsername").value || $("userBadge").textContent;
    $("credentialsForm").reset();
    toast("Usuario y contrasena actualizados. En el proximo inicio usa los nuevos datos.");
  } else {
    toast(data.error || "No se pudo guardar.");
  }
};

load().catch(() => location.href = "/login.html");
