// ─────────────────────────────────────────────────────────────────────────────
//  Nuvio Admin — complete rewrite
//  Targets: admin-page.html structure (login-overlay, app, stats-grid,
//  analytics-section, actions-bar, tokens-tbody, tokens-cards, modals)
// ─────────────────────────────────────────────────────────────────────────────
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
    getFirestore, collection, getDocs,
    doc, getDoc, setDoc, updateDoc, deleteDoc,
    serverTimestamp, Timestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// ── Configuration ───────────────────────────────────────────────────────────
const ADMIN_PASSWORD_HASH = "7f5741fbd93481f422aa5d0373c8b1c0bce7d4b9fa900bc40ac8fc624011e98d";

const firebaseConfig = {
    apiKey: "AIzaSyC4OXdfVs_mXPinhmpAt2su8WKZhUDXWoQ",
    authDomain: "multiaddon.firebaseapp.com",
    projectId: "multiaddon",
    storageBucket: "multiaddon.firebasestorage.app",
    messagingSenderId: "963978475190",
    appId: "1:963978475190:web:6796687180b021e049d817"
};

const MANIFEST_BASE = "https://nuviostreamapi.vercel.app";

const fbApp = initializeApp(firebaseConfig);
const db = getFirestore(fbApp);
const customersRef = collection(db, "customers");
const promoRef = collection(db, "promoCodes");

// ── State ────────────────────────────────────────────────────────────────────
const state = {
    tokens: [],          // [{id, nuvioEmail, nuvioPassword, name, assignedTo, status, expiresAt, createdAt, notes}]
    promos: [],          // [{id, days, status, assignedTo, redeemedAt, createdAt}]
    filter: "all",       // all | available | assigned | blocked | expired | unconfigured
    search: "",
    authed: false
};

let pendingConfirm = null;     // callback for confirm-modal
let renewContext = null;       // { id, currentMs }

// ── DOM refs ─────────────────────────────────────────────────────────────────
const $ = (id) => document.getElementById(id);

const loginOverlay = $("login-overlay");
const passwordInput = $("password-input");
const loginBtn = $("login-btn");
const loginError = $("login-error");

const appEl = $("app");
const refreshBtn = $("refresh-btn");
const logoutBtn = $("logout-btn");

const statsGrid = $("stats-grid");
const statTotal = $("stat-total");
const statAvailable = $("stat-available");
const statAssigned = $("stat-assigned");
const statBlocked = $("stat-blocked");
const statExpired = $("stat-expired");
const statUnconfigured = $("stat-unconfigured");

const barAssigned = $("bar-assigned");
const barAvailable = $("bar-available");
const barExpiring = $("bar-expiring");
const pctAssigned = $("pct-assigned");
const pctAvailable = $("pct-available");
const cntExpiring = $("cnt-expiring");

const searchInput = $("search-input");
const exportBtn = $("export-btn");
const bulkBtn = $("bulk-btn");
const promoBtn = $("promo-btn");
const createBtn = $("create-btn");

const filterIndicator = $("filter-indicator");
const filterText = $("filter-text");
const clearFilter = $("clear-filter");

const tokensTbody = $("tokens-tbody");
const tokensCards = $("tokens-cards");
const noResults = $("no-results");
const resultCount = $("result-count");

// create-modal
const createModal = $("create-modal");
const createEmail = $("create-email");
const createPassword = $("create-password");
const createName = $("create-name");
const createSubmit = $("create-submit");

// bulk-modal
const bulkModal = $("bulk-modal");
const bulkText = $("bulk-text");
const bulkSubmit = $("bulk-submit");

// edit-modal
const editModal = $("edit-modal");
const editId = $("edit-id");
const editToken = $("edit-token");
const editEmail = $("edit-email");
const editPassword = $("edit-password");
const editName = $("edit-name");
const editNotes = $("edit-notes");
const editSubmit = $("edit-submit");

// renew-modal
const renewModal = $("renew-modal");
const renewId = $("renew-id");
const renewInfo = $("renew-info");
const renewDays = $("renew-days");
const renewAddBtn = $("renew-add-btn");
const renewRemoveBtn = $("renew-remove-btn");

// assign-modal
const assignModal = $("assign-modal");
const assignIdEl = $("assign-id");
const assignEmail = $("assign-email");
const assignSubmit = $("assign-submit");

// promo-modal
const promoModal = $("promo-modal");
const promoDaysInput = $("promo-days-input");
const generatePromoBtn = $("generate-promo-btn");
const promoCodesList = $("promo-codes-list");

// confirm-modal
const confirmModal = $("confirm-modal");
const confirmTitle = $("confirm-title");
const confirmMessage = $("confirm-message");
const confirmYes = $("confirm-yes");
const confirmNo = $("confirm-no");

const toastEl = $("toast");

// ── Utilities ────────────────────────────────────────────────────────────────
async function hashStr(str) {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

function escapeHtml(s) {
    if (s === null || s === undefined) return "";
    return String(s)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

let toastTimer = null;
function showToast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.remove("hidden");
    // force reflow so animation re-triggers
    void toastEl.offsetWidth;
    toastEl.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
        toastEl.classList.remove("show");
        setTimeout(() => toastEl.classList.add("hidden"), 300);
    }, 3000);
}

function copyToClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).catch(() => fallbackCopy(text));
    } else {
        fallbackCopy(text);
    }
}
function fallbackCopy(text) {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand("copy"); } catch (_) {}
    document.body.removeChild(ta);
}

function genTokenId() {
    return "nuvio_" + Math.random().toString(36).substring(2, 9);
}

function genPromoCode() {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const block = () => Array.from({ length: 4 }, () =>
        chars[Math.floor(Math.random() * chars.length)]).join("");
    return `NUVIO-${block()}-${block()}`;
}

// Firestore Timestamp → ms
function tsToMs(ts) {
    if (!ts) return null;
    if (typeof ts.toMillis === "function") return ts.toMillis();
    if (typeof ts.seconds === "number") return ts.seconds * 1000;
    if (typeof ts === "number") return ts;
    return null;
}

function formatDate(ms) {
    if (!ms) return "—";
    const d = new Date(ms);
    return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function formatDateTime(ms) {
    if (!ms) return "—";
    const d = new Date(ms);
    return d.toLocaleDateString("en-US", {
        year: "numeric", month: "short", day: "numeric",
        hour: "2-digit", minute: "2-digit"
    });
}

// ── Token classification ─────────────────────────────────────────────────────
// available  = status=="active" AND assignedTo null/empty AND has nuvioEmail
// assigned   = assignedTo not null/empty
// blocked    = status != "active"
// expired    = expiresAt < now AND status == "active"
// unconfigured = no nuvioEmail
function categorizeToken(t) {
    if (!t.nuvioEmail || !String(t.nuvioEmail).trim()) return "unconfigured";
    if (t.status !== "active") return "blocked";
    if (t.assignedTo && String(t.assignedTo).trim()) return "assigned";
    const exp = tsToMs(t.expiresAt);
    if (exp !== null && exp < Date.now()) return "expired";
    return "available";
}

const STATUS_META = {
    available:    { label: "Available",    color: "#10b981" },
    assigned:     { label: "Assigned",     color: "#f59e0b" },
    blocked:      { label: "Blocked",      color: "#ef4444" },
    expired:      { label: "Expired",      color: "#fb923c" },
    unconfigured: { label: "Unconfigured", color: "#9ca3af" }
};

function statusBadgeHTML(t) {
    const cat = categorizeToken(t);
    const meta = STATUS_META[cat];
    return `<span class="badge" style="display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border-radius:999px;font-size:0.72rem;font-weight:600;background:${meta.color}22;color:${meta.color};border:1px solid ${meta.color}55;">
        <span style="width:6px;height:6px;border-radius:50%;background:${meta.color};"></span>${meta.label}
    </span>`;
}

function manifestUrl(id) {
    return `${MANIFEST_BASE}/${id}/manifest.json`;
}

// ── Auth ─────────────────────────────────────────────────────────────────────
async function tryLogin() {
    const pw = passwordInput.value;
    if (!pw) {
        loginError.textContent = "Enter the admin password.";
        return;
    }
    loginBtn.disabled = true;
    loginBtn.textContent = "Unlocking…";
    loginError.textContent = "";
    try {
        const hash = await hashStr(pw);
        if (hash === ADMIN_PASSWORD_HASH) {
            localStorage.setItem("nuvio_admin_auth", "1");
            state.authed = true;
            showApp();
        } else {
            loginError.textContent = "Wrong password.";
            passwordInput.value = "";
            passwordInput.focus();
        }
    } catch (e) {
        loginError.textContent = "Error: " + e.message;
    } finally {
        loginBtn.disabled = false;
        loginBtn.textContent = "Unlock";
    }
}

function logout() {
    localStorage.removeItem("nuvio_admin_auth");
    state.authed = false;
    appEl.classList.add("hidden");
    loginOverlay.classList.remove("hidden");
    passwordInput.value = "";
    passwordInput.focus();
}

function showApp() {
    loginOverlay.classList.add("hidden");
    appEl.classList.remove("hidden");
    loadTokens();
    loadPromos();
}

// ── Data loading ─────────────────────────────────────────────────────────────
async function loadTokens() {
    tokensTbody.innerHTML = `<tr><td colspan="7" class="loading-cell">Loading…</td></tr>`;
    tokensCards.innerHTML = `<div class="loading-cell">Loading…</div>`;
    try {
        const snap = await getDocs(customersRef);
        state.tokens = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        state.tokens.sort((a, b) => {
            const ca = tsToMs(a.createdAt) || 0;
            const cb = tsToMs(b.createdAt) || 0;
            return cb - ca;
        });
        updateStats();
        renderTokens();
    } catch (e) {
        console.error(e);
        tokensTbody.innerHTML = `<tr><td colspan="7" class="loading-cell" style="color:#ef4444;">Failed to load: ${escapeHtml(e.message)}</td></tr>`;
        tokensCards.innerHTML = `<div class="loading-cell" style="color:#ef4444;">Failed to load: ${escapeHtml(e.message)}</div>`;
        showToast("❌ Failed to load tokens.");
    }
}

async function loadPromos() {
    try {
        const snap = await getDocs(promoRef);
        state.promos = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        state.promos.sort((a, b) => (tsToMs(b.createdAt) || 0) - (tsToMs(a.createdAt) || 0));
        renderPromoList();
    } catch (e) {
        console.error(e);
        state.promos = [];
        renderPromoList();
    }
}

// ── Stats ────────────────────────────────────────────────────────────────────
function updateStats() {
    const totals = { all: 0, available: 0, assigned: 0, blocked: 0, expired: 0, unconfigured: 0 };
    let expiringSoon = 0;
    const now = Date.now();
    const sevenDays = 7 * 24 * 60 * 60 * 1000;

    for (const t of state.tokens) {
        const cat = categorizeToken(t);
        totals.all++;
        totals[cat]++;
        const exp = tsToMs(t.expiresAt);
        if (exp !== null && exp > now && exp < now + sevenDays) expiringSoon++;
    }

    statTotal.textContent = totals.all;
    statAvailable.textContent = totals.available;
    statAssigned.textContent = totals.assigned;
    statBlocked.textContent = totals.blocked;
    statExpired.textContent = totals.expired;
    statUnconfigured.textContent = totals.unconfigured;

    const pctA = totals.all ? Math.round((totals.assigned / totals.all) * 100) : 0;
    const pctV = totals.all ? Math.round((totals.available / totals.all) * 100) : 0;
    pctAssigned.textContent = pctA + "%";
    pctAvailable.textContent = pctV + "%";
    cntExpiring.textContent = expiringSoon;
    barAssigned.style.width = pctA + "%";
    barAvailable.style.width = pctV + "%";
    const pctE = totals.all ? Math.round((expiringSoon / totals.all) * 100) : 0;
    barExpiring.style.width = pctE + "%";
}

// ── Render tokens ────────────────────────────────────────────────────────────
function getFilteredTokens() {
    const q = state.search.trim().toLowerCase();
    return state.tokens.filter(t => {
        if (state.filter !== "all" && categorizeToken(t) !== state.filter) return false;
        if (!q) return true;
        const hay = [
            t.id, t.name, t.nuvioEmail, t.nuvioPassword,
            t.assignedTo, t.notes, t.status
        ].map(v => (v == null ? "" : String(v)).toLowerCase()).join(" ");
        return hay.includes(q);
    });
}

function renderTokens() {
    const list = getFilteredTokens();

    if (list.length === 0) {
        tokensTbody.innerHTML = "";
        tokensCards.innerHTML = "";
        noResults.classList.remove("hidden");
        resultCount.textContent = "0 tokens";
        return;
    }
    noResults.classList.add("hidden");
    resultCount.textContent = `${list.length} token${list.length === 1 ? "" : "s"}`;

    // Desktop table
    tokensTbody.innerHTML = list.map(renderRow).join("");

    // Mobile cards
    tokensCards.innerHTML = list.map(renderCard).join("");

    // Wire menu buttons
    tokensTbody.querySelectorAll("[data-menu-token]").forEach(btn => {
        btn.addEventListener("click", (e) => {
            e.stopPropagation();
            openActionMenu(btn.dataset.menuToken, btn, "row");
        });
    });
    tokensCards.querySelectorAll("[data-menu-token]").forEach(btn => {
        btn.addEventListener("click", (e) => {
            e.stopPropagation();
            openActionMenu(btn.dataset.menuToken, btn, "card");
        });
    });
}

function renderRow(t) {
    const exp = tsToMs(t.expiresAt);
    const name = t.name || "<em style='color:var(--text-muted)'>Unnamed</em>";
    const assigned = t.assignedTo
        ? escapeHtml(t.assignedTo)
        : `<span style="color:var(--text-muted)">—</span>`;
    const email = t.nuvioEmail
        ? escapeHtml(t.nuvioEmail)
        : `<span style="color:var(--text-muted)">—</span>`;
    return `<tr data-id="${escapeHtml(t.id)}">
        <td><div style="font-weight:600;">${name}</div></td>
        <td><code style="font-family:monospace;font-size:0.78rem;color:var(--text-muted);">${escapeHtml(t.id)}</code></td>
        <td>${email}</td>
        <td>${assigned}</td>
        <td>${formatDate(exp)}</td>
        <td>${statusBadgeHTML(t)}</td>
        <td>
            <button class="icon-btn" data-menu-token="${escapeHtml(t.id)}" title="Actions" aria-label="Actions">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/></svg>
            </button>
        </td>
    </tr>`;
}

function renderCard(t) {
    const exp = tsToMs(t.expiresAt);
    const name = t.name || "Unnamed";
    const assigned = t.assignedTo
        ? escapeHtml(t.assignedTo)
        : `<span style="color:var(--text-muted)">Unassigned</span>`;
    const email = t.nuvioEmail
        ? escapeHtml(t.nuvioEmail)
        : `<span style="color:var(--text-muted)">Not configured</span>`;
    return `<div class="token-card" data-id="${escapeHtml(t.id)}" style="background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius-md);padding:1rem;display:flex;flex-direction:column;gap:0.5rem;">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:0.5rem;">
            <div style="font-weight:600;flex:1;word-break:break-word;">${escapeHtml(name)}</div>
            ${statusBadgeHTML(t)}
        </div>
        <div style="font-size:0.75rem;color:var(--text-muted);font-family:monospace;word-break:break-all;">${escapeHtml(t.id)}</div>
        <div style="font-size:0.85rem;display:flex;flex-direction:column;gap:0.25rem;">
            <div><span style="color:var(--text-muted);">Email:</span> ${email}</div>
            <div><span style="color:var(--text-muted);">Assigned:</span> ${assigned}</div>
            <div><span style="color:var(--text-muted);">Expires:</span> ${formatDate(exp)}</div>
        </div>
        <div style="display:flex;justify-content:flex-end;">
            <button class="icon-btn" data-menu-token="${escapeHtml(t.id)}" title="Actions" aria-label="Actions">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/></svg>
            </button>
        </div>
    </div>`;
}

// ── Search & filter ──────────────────────────────────────────────────────────
function handleSearch() {
    state.search = searchInput.value;
    renderTokens();
}

function setFilter(filter) {
    state.filter = filter;
    // highlight active stat card
    statsGrid.querySelectorAll(".stat-card").forEach(c => c.classList.remove("active-filter"));
    const active = statsGrid.querySelector(`.stat-card[data-filter="${filter}"]`);
    if (active) active.classList.add("active-filter");

    if (filter === "all") {
        filterIndicator.classList.add("hidden");
    } else {
        const meta = STATUS_META[filter] || { label: filter };
        filterText.textContent = `Filtering: ${meta.label}`;
        filterIndicator.classList.remove("hidden");
    }
    renderTokens();
}

// ── Modal helpers ────────────────────────────────────────────────────────────
function openModal(id) { $(id).classList.remove("hidden"); }
function closeModal(id) { $(id).classList.add("hidden"); }
// expose for inline onclick handlers in HTML
window.closeModal = closeModal;

function showConfirm(title, message, onConfirm) {
    confirmTitle.textContent = title;
    confirmMessage.textContent = message;
    pendingConfirm = onConfirm;
    openModal("confirm-modal");
}

confirmYes.addEventListener("click", async () => {
    const cb = pendingConfirm;
    pendingConfirm = null;
    closeModal("confirm-modal");
    if (typeof cb === "function") {
        try { await cb(); } catch (e) { showToast("❌ " + e.message); }
    }
});
confirmNo.addEventListener("click", () => {
    pendingConfirm = null;
    closeModal("confirm-modal");
});

// ── Action menu (row-menu / card-menu) ───────────────────────────────────────
function closeActionMenu() {
    const existing = document.getElementById("action-menu");
    if (existing) existing.remove();
    document.removeEventListener("click", closeActionMenu);
}

function openActionMenu(tokenId, anchorEl, kind) {
    closeActionMenu();
    const t = state.tokens.find(x => x.id === tokenId);
    if (!t) return;

    const menu = document.createElement("div");
    menu.id = "action-menu";
    menu.className = kind === "card" ? "card-menu" : "row-menu";
    Object.assign(menu.style, {
        position: "fixed",
        zIndex: "9999",
        minWidth: "180px",
        background: "rgba(19,19,26,0.98)",
        backdropFilter: "blur(12px)",
        border: "1px solid var(--border-light)",
        borderRadius: "var(--radius-sm)",
        boxShadow: "var(--shadow-lg)",
        padding: "6px",
        display: "flex",
        flexDirection: "column",
        gap: "2px"
    });

    const isAssigned = !!(t.assignedTo && String(t.assignedTo).trim());
    const items = [
        { label: "Edit", icon: "✏️", fn: () => openEditModal(t) },
        { label: "Renew", icon: "⏱️", fn: () => openRenewModal(t) },
        { label: "Copy Link", icon: "🔗", fn: () => copyTokenLink(t) }
    ];
    if (isAssigned) {
        items.push({ label: "Unassign", icon: "↩️", fn: () => confirmUnassign(t) });
    } else {
        items.push({ label: "Assign", icon: "👤", fn: () => openAssignModal(t) });
    }
    if (t.status === "active") {
        items.push({ label: "Block", icon: "🚫", fn: () => confirmBlock(t) });
    } else {
        items.push({ label: "Unblock", icon: "✅", fn: () => unblockToken(t) });
    }
    items.push({ label: "Delete", icon: "🗑️", danger: true, fn: () => confirmDelete(t) });

    items.forEach(it => {
        const b = document.createElement("button");
        b.className = "menu-item" + (it.danger ? " menu-danger" : "");
        Object.assign(b.style, {
            display: "flex",
            alignItems: "center",
            gap: "10px",
            padding: "8px 12px",
            background: "transparent",
            border: "none",
            color: it.danger ? "#ef4444" : "var(--text-main)",
            fontSize: "0.85rem",
            textAlign: "left",
            cursor: "pointer",
            borderRadius: "6px",
            fontFamily: "inherit"
        });
        b.innerHTML = `<span style="width:18px;text-align:center;">${it.icon}</span><span>${it.label}</span>`;
        b.addEventListener("mouseenter", () => {
            b.style.background = it.danger ? "rgba(239,68,68,0.12)" : "rgba(255,255,255,0.06)";
        });
        b.addEventListener("mouseleave", () => { b.style.background = "transparent"; });
        b.addEventListener("click", (e) => {
            e.stopPropagation();
            closeActionMenu();
            it.fn();
        });
        menu.appendChild(b);
    });

    document.body.appendChild(menu);

    // Position: anchor below the button, aligned to right edge
    const rect = anchorEl.getBoundingClientRect();
    const menuRect = menu.getBoundingClientRect();
    let top = rect.bottom + 4;
    let left = rect.right - menuRect.width;
    if (top + menuRect.height > window.innerHeight - 8) {
        top = rect.top - menuRect.height - 4;
    }
    if (left < 8) left = 8;
    menu.style.top = top + "px";
    menu.style.left = left + "px";

    setTimeout(() => {
        document.addEventListener("click", closeActionMenu, { once: true });
    }, 0);
}

// ── Create token ─────────────────────────────────────────────────────────────
function openCreateModal() {
    createEmail.value = "";
    createPassword.value = "";
    createName.value = "";
    openModal("create-modal");
    setTimeout(() => createEmail.focus(), 50);
}

createSubmit.addEventListener("click", async () => {
    const email = createEmail.value.trim();
    const pwd = createPassword.value.trim();
    const name = createName.value.trim();
    if (!email || !pwd) {
        showToast("❌ Email and password are required.");
        return;
    }
    createSubmit.disabled = true;
    createSubmit.textContent = "Creating…";
    try {
        const id = genTokenId();
        await setDoc(doc(db, "customers", id), {
            nuvioEmail: email,
            nuvioPassword: pwd,
            name: name || email,
            assignedTo: null,
            status: "active",
            notes: "",
            createdAt: serverTimestamp()
        });
        closeModal("create-modal");
        showToast("✅ Token created.");
        copyToClipboard(manifestUrl(id));
        await loadTokens();
    } catch (e) {
        showToast("❌ " + e.message);
    } finally {
        createSubmit.disabled = false;
        createSubmit.textContent = "Create";
    }
});

// ── Bulk create ──────────────────────────────────────────────────────────────
function openBulkModal() {
    bulkText.value = "";
    openModal("bulk-modal");
    setTimeout(() => bulkText.focus(), 50);
}

bulkSubmit.addEventListener("click", async () => {
    const text = bulkText.value.trim();
    if (!text) { showToast("❌ No input provided."); return; }
    const lines = text.split("\n").filter(l => l.trim() !== "");
    let ok = 0, fail = 0;
    bulkSubmit.disabled = true;
    bulkSubmit.textContent = `Creating 0/${lines.length}…`;
    for (let i = 0; i < lines.length; i++) {
        const parts = lines[i].split(",");
        if (parts.length < 2) { fail++; continue; }
        const email = parts[0].trim();
        const pwd = parts.slice(1).join(",").trim();
        try {
            const id = genTokenId();
            await setDoc(doc(db, "customers", id), {
                nuvioEmail: email,
                nuvioPassword: pwd,
                name: email,
                assignedTo: null,
                status: "active",
                notes: "",
                createdAt: serverTimestamp()
            });
            ok++;
        } catch (e) {
            console.error(e);
            fail++;
        }
        bulkSubmit.textContent = `Creating ${i + 1}/${lines.length}…`;
    }
    bulkSubmit.disabled = false;
    bulkSubmit.textContent = "Create All";
    closeModal("bulk-modal");
    showToast(`✅ Bulk: ${ok} created, ${fail} failed.`);
    await loadTokens();
});

// ── Edit token ───────────────────────────────────────────────────────────────
function openEditModal(t) {
    editId.value = t.id;
    editToken.value = t.id;
    editEmail.value = t.nuvioEmail || "";
    editPassword.value = t.nuvioPassword || "";
    editName.value = t.name || "";
    editNotes.value = t.notes || "";
    openModal("edit-modal");
}

editSubmit.addEventListener("click", async () => {
    const id = editId.value;
    if (!id) return;
    const email = editEmail.value.trim();
    const pwd = editPassword.value.trim();
    if (!email || !pwd) {
        showToast("❌ Email and password are required.");
        return;
    }
    editSubmit.disabled = true;
    editSubmit.textContent = "Saving…";
    try {
        await updateDoc(doc(db, "customers", id), {
            nuvioEmail: email,
            nuvioPassword: pwd,
            name: editName.value.trim(),
            notes: editNotes.value.trim()
        });
        closeModal("edit-modal");
        showToast("✅ Token updated.");
        await loadTokens();
    } catch (e) {
        showToast("❌ " + e.message);
    } finally {
        editSubmit.disabled = false;
        editSubmit.textContent = "Save";
    }
});

// ── Renew token ──────────────────────────────────────────────────────────────
function openRenewModal(t) {
    renewContext = { id: t.id, currentMs: tsToMs(t.expiresAt) };
    renewId.value = t.id;
    const cur = renewContext.currentMs;
    let info = `<div style="font-size:0.85rem;color:var(--text-muted);line-height:1.6;">`;
    info += `<div><strong style="color:var(--text-main);">Token:</strong> <code style="font-family:monospace;">${escapeHtml(t.id)}</code></div>`;
    if (cur) {
        info += `<div><strong style="color:var(--text-main);">Current expiry:</strong> ${formatDateTime(cur)}</div>`;
        const diff = cur - Date.now();
        if (diff > 0) {
            const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
            info += `<div style="color:#10b981;">${days} day${days === 1 ? "" : "s"} remaining</div>`;
        } else {
            info += `<div style="color:#ef4444;">EXPIRED</div>`;
        }
    } else {
        info += `<div><strong style="color:var(--text-main);">Current expiry:</strong> Not set</div>`;
    }
    info += `</div>`;
    renewInfo.innerHTML = info;
    renewDays.value = "7";
    openModal("renew-modal");
}

// Quick-set buttons (7, 30, 90)
renewModal.querySelectorAll(".renew-btn").forEach(btn => {
    btn.addEventListener("click", () => {
        renewDays.value = btn.dataset.days;
    });
});

renewAddBtn.addEventListener("click", async () => {
    if (!renewContext) return;
    const days = parseInt(renewDays.value, 10);
    if (!days || days <= 0) { showToast("❌ Enter a valid number of days."); return; }
    let base = renewContext.currentMs ? new Date(renewContext.currentMs) : new Date();
    if (base.getTime() < Date.now()) base = new Date();
    base.setDate(base.getDate() + days);
    renewAddBtn.disabled = true;
    try {
        await updateDoc(doc(db, "customers", renewContext.id), {
            expiresAt: Timestamp.fromDate(base),
            status: "active"
        });
        showToast(`✅ Added ${days} day${days === 1 ? "" : "s"}.`);
        closeModal("renew-modal");
        await loadTokens();
    } catch (e) {
        showToast("❌ " + e.message);
    } finally {
        renewAddBtn.disabled = false;
    }
});

renewRemoveBtn.addEventListener("click", async () => {
    if (!renewContext) return;
    const days = parseInt(renewDays.value, 10);
    if (!days || days <= 0) { showToast("❌ Enter a valid number of days."); return; }
    if (!renewContext.currentMs) { showToast("❌ No expiry set to remove from."); return; }
    let base = new Date(renewContext.currentMs);
    base.setDate(base.getDate() - days);
    renewRemoveBtn.disabled = true;
    try {
        await updateDoc(doc(db, "customers", renewContext.id), {
            expiresAt: Timestamp.fromDate(base)
        });
        showToast(`✅ Removed ${days} day${days === 1 ? "" : "s"}.`);
        closeModal("renew-modal");
        await loadTokens();
    } catch (e) {
        showToast("❌ " + e.message);
    } finally {
        renewRemoveBtn.disabled = false;
    }
});

// ── Assign / unassign ────────────────────────────────────────────────────────
function openAssignModal(t) {
    assignIdEl.value = t.id;
    assignEmail.value = "";
    openModal("assign-modal");
    setTimeout(() => assignEmail.focus(), 50);
}

assignSubmit.addEventListener("click", async () => {
    const id = assignIdEl.value;
    const email = assignEmail.value.trim();
    if (!id) return;
    if (!email) { showToast("❌ Enter a customer email."); return; }

    // Reassignment check — is this email already assigned to a different token?
    const conflict = state.tokens.find(t => t.id !== id && t.assignedTo && String(t.assignedTo).trim().toLowerCase() === email.toLowerCase());
    if (conflict) {
        closeModal("assign-modal");
        showConfirm(
            "Reassign Customer?",
            `"${email}" is already assigned to token "${conflict.id}". Assigning here will NOT automatically unassign the other token. Continue anyway?`,
            async () => {
                await doAssign(id, email);
            }
        );
        return;
    }
    await doAssign(id, email);
});

async function doAssign(id, email) {
    try {
        await updateDoc(doc(db, "customers", id), {
            assignedTo: email,
            status: "active"
        });
        closeModal("assign-modal");
        showToast(`✅ Assigned to ${email}.`);
        await loadTokens();
    } catch (e) {
        showToast("❌ " + e.message);
    }
}

function confirmUnassign(t) {
    showConfirm(
        "Unassign Token?",
        `Remove the assignment from "${t.assignedTo}"? The customer will lose access on next login.`,
        async () => {
            try {
                await updateDoc(doc(db, "customers", t.id), { assignedTo: null });
                showToast("✅ Token unassigned.");
                await loadTokens();
            } catch (e) {
                showToast("❌ " + e.message);
            }
        }
    );
}

// ── Block / unblock ──────────────────────────────────────────────────────────
function confirmBlock(t) {
    showConfirm(
        "Block Token?",
        `Block token "${t.id}"? The customer will be denied access immediately.`,
        async () => {
            try {
                await updateDoc(doc(db, "customers", t.id), { status: "blocked" });
                showToast("✅ Token blocked.");
                await loadTokens();
            } catch (e) {
                showToast("❌ " + e.message);
            }
        }
    );
}

async function unblockToken(t) {
    try {
        await updateDoc(doc(db, "customers", t.id), { status: "active" });
        showToast("✅ Token unblocked.");
        await loadTokens();
    } catch (e) {
        showToast("❌ " + e.message);
    }
}

// ── Delete ───────────────────────────────────────────────────────────────────
function confirmDelete(t) {
    showConfirm(
        "Delete Token?",
        `Permanently delete token "${t.id}"? This cannot be undone.`,
        async () => {
            try {
                await deleteDoc(doc(db, "customers", t.id));
                showToast("🗑️ Token deleted.");
                await loadTokens();
            } catch (e) {
                showToast("❌ " + e.message);
            }
        }
    );
}

// ── Copy link ────────────────────────────────────────────────────────────────
function copyTokenLink(t) {
    copyToClipboard(manifestUrl(t.id));
    showToast("🔗 Manifest link copied.");
}

// ── Export CSV ───────────────────────────────────────────────────────────────
function exportCSV() {
    const list = getFilteredTokens();
    if (list.length === 0) { showToast("❌ Nothing to export."); return; }
    const headers = ["Token ID", "Name", "Nuvio Email", "Nuvio Password", "Assigned To", "Status", "Category", "Expires At", "Created At", "Notes"];
    const rows = list.map(t => {
        const cat = categorizeToken(t);
        return [
            t.id,
            t.name || "",
            t.nuvioEmail || "",
            t.nuvioPassword || "",
            t.assignedTo || "",
            t.status || "",
            cat,
            tsToMs(t.expiresAt) ? new Date(tsToMs(t.expiresAt)).toISOString() : "",
            tsToMs(t.createdAt) ? new Date(tsToMs(t.createdAt)).toISOString() : "",
            t.notes || ""
        ].map(csvCell).join(",");
    });
    const csv = headers.join(",") + "\n" + rows.join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `nuvio-tokens-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast(`✅ Exported ${list.length} token(s).`);
}

function csvCell(v) {
    const s = v == null ? "" : String(v);
    if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
}

// ── Promo codes ──────────────────────────────────────────────────────────────
function openPromoModal() {
    promoDaysInput.value = "7";
    openModal("promo-modal");
    loadPromos();
}

generatePromoBtn.addEventListener("click", async () => {
    const days = parseInt(promoDaysInput.value, 10);
    if (!days || days <= 0) { showToast("❌ Enter valid days."); return; }
    generatePromoBtn.disabled = true;
    generatePromoBtn.textContent = "Generating…";
    try {
        const code = genPromoCode();
        await setDoc(doc(db, "promoCodes", code), {
            days,
            status: "active",
            assignedTo: null,
            redeemedAt: null,
            createdAt: serverTimestamp()
        });
        showToast(`✅ Promo code generated: ${code}`);
        copyToClipboard(code);
        await loadPromos();
    } catch (e) {
        showToast("❌ " + e.message);
    } finally {
        generatePromoBtn.disabled = false;
        generatePromoBtn.textContent = "Generate";
    }
});

function renderPromoList() {
    if (state.promos.length === 0) {
        promoCodesList.innerHTML = `<p style="text-align:center;color:var(--text-muted);padding:1rem;">No promo codes yet. Generate one above!</p>`;
        return;
    }
    promoCodesList.innerHTML = state.promos.map(renderPromoItem).join("");
    promoCodesList.querySelectorAll("[data-promo-copy]").forEach(b => {
        b.addEventListener("click", () => {
            copyToClipboard(b.dataset.promoCopy);
            showToast("📋 Promo code copied.");
        });
    });
    promoCodesList.querySelectorAll("[data-promo-delete]").forEach(b => {
        b.addEventListener("click", () => {
            const code = b.dataset.promoDelete;
            confirmDeletePromo(code);
        });
    });
}

function renderPromoItem(p) {
    const statusColor = p.status === "active" ? "#10b981" : (p.status === "used" ? "#9ca3af" : "#f59e0b");
    const redeemed = p.redeemedAt
        ? `<span style="color:var(--text-muted);">by ${escapeHtml(p.assignedTo || "—")} on ${formatDate(tsToMs(p.redeemedAt))}</span>`
        : "";
    return `<div style="display:flex;align-items:center;justify-content:space-between;gap:0.75rem;padding:0.75rem;background:rgba(255,255,255,0.03);border:1px solid var(--border);border-radius:var(--radius-sm);margin-bottom:0.5rem;">
        <div style="flex:1;min-width:0;">
            <div style="display:flex;align-items:center;gap:0.5rem;flex-wrap:wrap;">
                <code style="font-family:monospace;font-weight:600;font-size:0.9rem;">${escapeHtml(p.id)}</code>
                <span style="padding:2px 8px;border-radius:999px;font-size:0.68rem;font-weight:600;background:${statusColor}22;color:${statusColor};border:1px solid ${statusColor}55;text-transform:uppercase;">${escapeHtml(p.status || "active")}</span>
                <span style="padding:2px 8px;border-radius:999px;font-size:0.68rem;font-weight:600;background:rgba(124,58,237,0.18);color:#c4b5fd;border:1px solid rgba(124,58,237,0.4);">${p.days}d</span>
            </div>
            <div style="font-size:0.75rem;color:var(--text-muted);margin-top:0.25rem;">Created ${formatDate(tsToMs(p.createdAt))} ${redeemed}</div>
        </div>
        <div style="display:flex;gap:0.25rem;flex-shrink:0;">
            <button class="icon-btn" data-promo-copy="${escapeHtml(p.id)}" title="Copy code" aria-label="Copy">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
            </button>
            <button class="icon-btn" data-promo-delete="${escapeHtml(p.id)}" title="Delete code" aria-label="Delete" style="color:#ef4444;">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
            </button>
        </div>
    </div>`;
}

function confirmDeletePromo(code) {
    showConfirm(
        "Delete Promo Code?",
        `Permanently delete promo code "${code}"? This cannot be undone.`,
        async () => {
            try {
                await deleteDoc(doc(db, "promoCodes", code));
                showToast("🗑️ Promo code deleted.");
                await loadPromos();
            } catch (e) {
                showToast("❌ " + e.message);
            }
        }
    );
}

// ── Event wiring ─────────────────────────────────────────────────────────────
loginBtn.addEventListener("click", tryLogin);
passwordInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") tryLogin();
});
logoutBtn.addEventListener("click", logout);
refreshBtn.addEventListener("click", async () => {
    refreshBtn.disabled = true;
    await Promise.all([loadTokens(), loadPromos()]);
    refreshBtn.disabled = false;
    showToast("🔄 Refreshed.");
});

searchInput.addEventListener("input", handleSearch);

createBtn.addEventListener("click", openCreateModal);
bulkBtn.addEventListener("click", openBulkModal);
promoBtn.addEventListener("click", openPromoModal);
exportBtn.addEventListener("click", exportCSV);

clearFilter.addEventListener("click", () => setFilter("all"));

// Stat-card click → filter
statsGrid.querySelectorAll(".stat-card").forEach(card => {
    card.addEventListener("click", () => {
        const f = card.dataset.filter;
        if (state.filter === f) {
            setFilter("all");
        } else {
            setFilter(f);
        }
    });
    card.style.cursor = "pointer";
});

// Close action menu on escape / scroll / resize
document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeActionMenu();
});
window.addEventListener("scroll", closeActionMenu, true);
window.addEventListener("resize", closeActionMenu);

// ── Init ─────────────────────────────────────────────────────────────────────
(function init() {
    if (localStorage.getItem("nuvio_admin_auth") === "1") {
        state.authed = true;
        showApp();
    } else {
        loginOverlay.classList.remove("hidden");
        appEl.classList.add("hidden");
        setTimeout(() => passwordInput.focus(), 100);
    }
})();
