import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
    getFirestore, collection, getDocs, query, where, limit,
    doc, setDoc, updateDoc, deleteDoc, serverTimestamp, Timestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// ── Config ──
const ADMIN_PASSWORD_HASH = "7f5741fbd93481f422aa5d0373c8b1c0bce7d4b9fa900bc40ac8fc624011e98d";

const firebaseConfig = {
    apiKey: "AIzaSyC4OXdfVs_mXPinhmpAt2su8WKZhUDXWoQ",
    authDomain: "multiaddon.firebaseapp.com",
    projectId: "multiaddon",
    storageBucket: "multiaddon.firebasestorage.app",
    messagingSenderId: "963978475190",
    appId: "1:963978475190:web:6796687180b021e049d817"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// ── State ──
let allTokens = [];
let currentFilter = 'all';
let searchTerm = '';

// ── Helpers ──
async function hashStr(str) {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function showToast(msg) {
    const toast = document.getElementById('toast');
    toast.textContent = msg;
    toast.classList.remove('hidden');
    setTimeout(() => toast.classList.add('hidden'), 3000);
}

function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
}

function escapeJs(str) {
    if (!str) return '';
    return String(str).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '&quot;');
}

function randomId() {
    return "nuvio_" + Math.random().toString(36).substring(2, 9);
}

function getExpiryInfo(expiresAt) {
    if (!expiresAt) return { text: '—', daysLabel: '', isExpired: false, timestamp: null };
    let ms;
    if (expiresAt.toMillis) ms = expiresAt.toMillis();
    else if (expiresAt.seconds) ms = expiresAt.seconds * 1000;
    else ms = new Date(expiresAt).getTime();
    const now = Date.now();
    const diff = ms - now;
    const days = Math.floor(diff / 86400000);
    const isExpired = diff <= 0;
    const date = new Date(ms);
    const text = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    let daysLabel = '';
    if (isExpired) daysLabel = 'Expired';
    else if (days === 0) daysLabel = 'Today';
    else if (days === 1) daysLabel = '1 day left';
    else daysLabel = days + ' days left';
    return { text, daysLabel, isExpired, timestamp: ms };
}

function getTokenStatus(t) {
    const assignedTo = t.assignedTo || '';
    const isAssigned = assignedTo && assignedTo.trim() !== '';
    const status = t.status || 'active';
    const isBlocked = status !== 'active';
    const expiry = getExpiryInfo(t.expiresAt);
    const isExpired = expiry.isExpired;
    const isUnconfigured = !t.nuvioEmail || t.nuvioEmail.trim() === '';
    const isAvailable = !isAssigned && !isBlocked && !isExpired && !isUnconfigured;
    let badgeClass, badgeText;
    if (isBlocked && isExpired) { badgeClass = 'badge-red'; badgeText = 'Expired'; }
    else if (isBlocked) { badgeClass = 'badge-red'; badgeText = 'Blocked'; }
    else if (isExpired) { badgeClass = 'badge-orange'; badgeText = 'Expired'; }
    else if (isUnconfigured) { badgeClass = 'badge-muted'; badgeText = 'Unconfigured'; }
    else if (isAssigned) { badgeClass = 'badge-amber'; badgeText = 'Assigned'; }
    else { badgeClass = 'badge-green'; badgeText = 'Available'; }
    return { isAssigned, isBlocked, isExpired, isUnconfigured, isAvailable, badgeClass, badgeText, expiry, assignedTo, status };
}

// ── Confirmation Modal (replaces browser confirm) ──
let confirmCallback = null;
function showConfirm(title, message, onConfirm) {
    document.getElementById('confirm-title').textContent = title;
    document.getElementById('confirm-message').textContent = message;
    confirmCallback = onConfirm;
    openModal('confirm-modal');
}
document.getElementById('confirm-yes').addEventListener('click', () => {
    closeModal('confirm-modal');
    if (confirmCallback) { confirmCallback(); confirmCallback = null; }
});
document.getElementById('confirm-no').addEventListener('click', () => {
    closeModal('confirm-modal');
    confirmCallback = null;
});

// ── Login ──
async function login() {
    const input = document.getElementById('password-input');
    const error = document.getElementById('login-error');
    const btn = document.getElementById('login-btn');
    const password = input.value.trim();
    if (!password) { error.textContent = 'Enter password'; return; }
    btn.textContent = 'Checking...';
    btn.disabled = true;
    const hash = await hashStr(password);
    if (hash === ADMIN_PASSWORD_HASH) {
        localStorage.setItem('nuvio_auth', hash);
        showApp();
    } else {
        error.textContent = 'Wrong password';
        btn.textContent = 'Unlock';
        btn.disabled = false;
        input.value = '';
        input.focus();
    }
}

function showApp() {
    document.getElementById('login-overlay').classList.add('hidden');
    document.getElementById('app').classList.remove('hidden');
    loadTokens();
}

function logout() {
    localStorage.removeItem('nuvio_auth');
    location.reload();
}

// ── Load ──
async function loadTokens() {
    try {
        const snapshot = await getDocs(collection(db, "customers"));
        allTokens = [];
        snapshot.forEach(docSnap => { allTokens.push({ id: docSnap.id, ...docSnap.data() }); });
        updateStats();
        renderTokens();
    } catch (err) {
        console.error('Failed to load:', err);
        showToast('Failed to load tokens');
    }
}

// ── Stats ──
function updateStats() {
    let available = 0, assigned = 0, blocked = 0, expired = 0, unconfigured = 0;
    let expiringSoon = 0;
    allTokens.forEach(t => {
        const s = getTokenStatus(t);
        if (s.isAvailable) available++;
        if (s.isAssigned) assigned++;
        if (s.isBlocked) blocked++;
        if (s.isExpired && !s.isBlocked) expired++;
        if (s.isUnconfigured) unconfigured++;
        // Expiring soon = within 7 days
        if (s.expiry.timestamp && !s.isExpired) {
            const daysLeft = Math.floor((s.expiry.timestamp - Date.now()) / 86400000);
            if (daysLeft <= 7) expiringSoon++;
        }
    });
    document.getElementById('stat-total').textContent = allTokens.length;
    document.getElementById('stat-available').textContent = available;
    document.getElementById('stat-assigned').textContent = assigned;
    document.getElementById('stat-blocked').textContent = blocked;
    document.getElementById('stat-expired').textContent = expired;
    document.getElementById('stat-unconfigured').textContent = unconfigured;

    // Analytics (computed, 0 extra reads)
    const total = allTokens.length || 1; // avoid divide by zero
    const pctAssigned = Math.round((assigned / total) * 100);
    const pctAvailable = Math.round((available / total) * 100);
    document.getElementById('pct-assigned').textContent = pctAssigned + '%';
    document.getElementById('bar-assigned').style.width = pctAssigned + '%';
    document.getElementById('pct-available').textContent = pctAvailable + '%';
    document.getElementById('bar-available').style.width = pctAvailable + '%';
    document.getElementById('cnt-expiring').textContent = expiringSoon;
    document.getElementById('bar-expiring').style.width = Math.round((expiringSoon / total) * 100) + '%';
}

// ── Filter ──
function getFilteredTokens() {
    return allTokens.filter(t => {
        const s = getTokenStatus(t);
        if (currentFilter === 'available' && !s.isAvailable) return false;
        if (currentFilter === 'assigned' && !s.isAssigned) return false;
        if (currentFilter === 'blocked' && !s.isBlocked) return false;
        if (currentFilter === 'expired' && !(s.isExpired && !s.isBlocked)) return false;
        if (currentFilter === 'unconfigured' && !s.isUnconfigured) return false;
        if (searchTerm) {
            const haystack = [t.id, t.nuvioEmail, t.nuvioPassword, t.name, t.assignedTo, t.notes]
                .filter(Boolean).join(' ').toLowerCase();
            if (!haystack.includes(searchTerm)) return false;
        }
        return true;
    });
}

// ── Render ──
function renderTokens() {
    const filtered = getFilteredTokens();
    document.getElementById('result-count').textContent = `${filtered.length} token${filtered.length !== 1 ? 's' : ''}`;
    const noResults = document.getElementById('no-results');
    if (filtered.length === 0) {
        document.getElementById('tokens-tbody').innerHTML = '';
        document.getElementById('tokens-cards').innerHTML = '';
        noResults.classList.remove('hidden');
        return;
    }
    noResults.classList.add('hidden');
    renderDesktopTable(filtered);
    renderMobileCards(filtered);
}

function renderDesktopTable(tokens) {
    const tbody = document.getElementById('tokens-tbody');
    tbody.innerHTML = tokens.map(t => {
        const s = getTokenStatus(t);
        const name = t.name || (s.assignedTo ? escapeHtml(s.assignedTo) : '—');
        const assignedBadge = s.isAssigned
            ? `<span class="badge badge-muted">${escapeHtml(s.assignedTo)}</span>`
            : '<span style="color:var(--text-dim)">—</span>';
        return `
        <tr>
            <td>${escapeHtml(name)}</td>
            <td><code style="font-size:11px;color:var(--text-muted)">${escapeHtml(t.id)}</code></td>
            <td>${t.nuvioEmail ? escapeHtml(t.nuvioEmail) : '<span style="color:var(--text-dim)">—</span>'}</td>
            <td>${assignedBadge}</td>
            <td><div>${s.expiry.text}</div><div style="font-size:11px;color:var(--text-dim)">${s.expiry.daysLabel}</div></td>
            <td><span class="badge ${s.badgeClass}">${s.badgeText}</span></td>
            <td>
                <div class="action-btns">
                    <button class="icon-btn" title="Edit" onclick="openEdit('${escapeJs(t.id)}')"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg></button>
                    <button class="icon-btn" title="Renew" onclick="openRenew('${escapeJs(t.id)}')"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"></polyline><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path></svg></button>
                    <button class="icon-btn" title="More" onclick="toggleRowMenu('${escapeJs(t.id)}')"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="5" r="1"></circle><circle cx="12" cy="12" r="1"></circle><circle cx="12" cy="19" r="1"></circle></svg></button>
                </div>
                <div class="row-menu hidden" id="menu-${escapeJs(t.id)}">
                    <button onclick="copyLink('${escapeJs(t.id)}')">Copy Link</button>
                    ${s.isAssigned ? `<button onclick="confirmUnassign('${escapeJs(t.id)}')">Unassign</button>` : `<button onclick="openAssign('${escapeJs(t.id)}')">Assign to User</button>`}
                    <button onclick="confirmBlock('${escapeJs(t.id)}','${escapeJs(s.status)}')">${s.isBlocked ? 'Unblock' : 'Block'}</button>
                    <button class="danger" onclick="confirmDelete('${escapeJs(t.id)}')">Delete</button>
                </div>
            </td>
        </tr>`;
    }).join('');
}

function renderMobileCards(tokens) {
    const container = document.getElementById('tokens-cards');
    container.innerHTML = tokens.map(t => {
        const s = getTokenStatus(t);
        const name = t.name || (s.assignedTo ? escapeHtml(s.assignedTo) : 'Unnamed');
        return `
        <div class="token-card">
            <div class="token-card-header">
                <div>
                    <div class="token-card-name">${escapeHtml(name)}</div>
                    <div class="token-card-token">${escapeHtml(t.id)}</div>
                </div>
                <span class="badge ${s.badgeClass}">${s.badgeText}</span>
            </div>
            ${t.nuvioEmail ? `<div class="token-card-row"><span class="token-card-label">Nuvio Email</span><span class="token-card-value">${escapeHtml(t.nuvioEmail)}</span></div>` : ''}
            ${t.nuvioPassword ? `<div class="token-card-row"><span class="token-card-label">Password</span><span class="token-card-value">${escapeHtml(t.nuvioPassword)}</span></div>` : ''}
            ${s.isAssigned ? `<div class="token-card-row"><span class="token-card-label">Assigned To</span><span class="token-card-value">${escapeHtml(s.assignedTo)}</span></div>` : ''}
            <div class="token-card-row"><span class="token-card-label">Expires</span><span class="token-card-value">${s.expiry.text}<br><span style="font-size:11px;color:var(--text-dim)">${s.expiry.daysLabel}</span></span></div>
            <div class="token-card-actions">
                <button class="btn btn-ghost" onclick="openEdit('${escapeJs(t.id)}')">Edit</button>
                <button class="btn btn-ghost" onclick="openRenew('${escapeJs(t.id)}')">Renew</button>
                <button class="btn btn-ghost" onclick="toggleCardMenu('${escapeJs(t.id)}')">More</button>
            </div>
            <div class="card-menu hidden" id="cmenu-${escapeJs(t.id)}">
                <button onclick="copyLink('${escapeJs(t.id)}')">Copy Link</button>
                ${s.isAssigned ? `<button onclick="confirmUnassign('${escapeJs(t.id)}')">Unassign</button>` : `<button onclick="openAssign('${escapeJs(t.id)}')">Assign to User</button>`}
                <button onclick="confirmBlock('${escapeJs(t.id)}','${escapeJs(s.status)}')">${s.isBlocked ? 'Unblock' : 'Block'}</button>
                <button class="danger" onclick="confirmDelete('${escapeJs(t.id)}')">Delete</button>
            </div>
        </div>`;
    }).join('');
}

// ── Row menu toggle (desktop) ──
window.toggleRowMenu = (id) => {
    const menu = document.getElementById(`menu-${id}`);
    document.querySelectorAll('.row-menu').forEach(m => { if (m.id !== `menu-${id}`) m.classList.add('hidden'); });
    menu.classList.toggle('hidden');
};

// ── Card menu toggle (mobile) ──
window.toggleCardMenu = (id) => {
    const menu = document.getElementById(`cmenu-${id}`);
    document.querySelectorAll('.card-menu').forEach(m => { if (m.id !== `cmenu-${id}`) m.classList.add('hidden'); });
    menu.classList.toggle('hidden');
};

// Close menus when clicking outside
document.addEventListener('click', (e) => {
    if (!e.target.closest('.action-btns') && !e.target.closest('.row-menu') && !e.target.closest('.token-card-actions') && !e.target.closest('.card-menu')) {
        document.querySelectorAll('.row-menu, .card-menu').forEach(m => m.classList.add('hidden'));
    }
});

// ── Actions ──
window.copyLink = (tokenId) => {
    navigator.clipboard.writeText(`https://nuviostreamapi.vercel.app/${tokenId}/manifest.json`);
    showToast('Link copied');
};

window.openEdit = (id) => {
    const t = allTokens.find(x => x.id === id);
    if (!t) return;
    document.getElementById('edit-id').value = id;
    document.getElementById('edit-token').value = id;
    document.getElementById('edit-email').value = t.nuvioEmail || '';
    document.getElementById('edit-password').value = t.nuvioPassword || '';
    document.getElementById('edit-name').value = t.name || '';
    document.getElementById('edit-notes').value = t.notes || '';
    openModal('edit-modal');
};

window.openRenew = (id) => {
    const t = allTokens.find(x => x.id === id);
    if (!t) return;
    document.getElementById('renew-id').value = id;
    const s = getTokenStatus(t);
    document.getElementById('renew-info').innerHTML = `
        <div style="margin-bottom:6px"><strong>Current expiry:</strong> ${s.expiry.text}</div>
        <div style="color:${s.isExpired ? 'var(--red)' : 'var(--green)'}">${s.expiry.daysLabel || 'No expiry'}</div>
    `;
    document.getElementById('renew-days').value = '7';
    openModal('renew-modal');
};

window.openAssign = (id) => {
    document.getElementById('assign-id').value = id;
    document.getElementById('assign-email').value = '';
    openModal('assign-modal');
};

// Confirmation actions (use popup, not browser confirm)
window.confirmUnassign = (id) => {
    showConfirm('Unassign Token', 'This will remove the customer from this token. They will lose access immediately. The token goes back to the pool with no expiry. Continue?', async () => {
        try {
            // Reset assignedTo AND expiresAt — token goes back to the shelf, fresh.
            // Expiry will be set again when the token is next assigned.
            await updateDoc(doc(db, "customers", id), { assignedTo: null, name: '', expiresAt: null });
            showToast('Unassigned');
            loadTokens();
        } catch { showToast('Failed'); }
    });
};

window.confirmBlock = (id, currentStatus) => {
    const action = currentStatus === 'active' ? 'block' : 'unblock';
    showConfirm(`${action.charAt(0).toUpperCase() + action.slice(1)} Token`, `Are you sure you want to ${action} this token?`, async () => {
        const newStatus = currentStatus === 'active' ? 'blocked' : 'active';
        try {
            await updateDoc(doc(db, "customers", id), { status: newStatus });
            showToast(newStatus === 'blocked' ? 'Blocked' : 'Unblocked');
            loadTokens();
        } catch { showToast('Failed'); }
    });
};

window.confirmDelete = (id) => {
    showConfirm('Delete Token', `This will permanently delete "${id}". The user will lose access immediately. This cannot be undone.`, async () => {
        try {
            await deleteDoc(doc(db, "customers", id));
            showToast('Deleted');
            loadTokens();
        } catch { showToast('Failed'); }
    });
};

window.openModal = (id) => document.getElementById(id).classList.remove('hidden');
window.closeModal = (id) => document.getElementById(id).classList.add('hidden');

// ── Create ──
document.getElementById('create-btn').addEventListener('click', () => {
    ['create-email','create-password','create-name'].forEach(id => document.getElementById(id).value = '');
    openModal('create-modal');
});
document.getElementById('create-submit').addEventListener('click', async () => {
    const email = document.getElementById('create-email').value.trim();
    const password = document.getElementById('create-password').value.trim();
    const name = document.getElementById('create-name').value.trim();
    // Days field removed from UI — slot defaults to 30-day shelf life.
    // Real duration is set when the token is assigned or a promo code is redeemed.
    const days = 30;
    if (!email || !password) { showToast('Email and password required'); return; }

    // Check for duplicate Nuvio email
    const existing = allTokens.find(t => (t.nuvioEmail || '').toLowerCase() === email.toLowerCase());
    if (existing) {
        closeModal('create-modal');
        showConfirm('Duplicate Nuvio Email', `A token with Nuvio email "${email}" already exists (${existing.id}). Create another one anyway?`, () => {
            doCreateToken(email, password, name, days);
        });
        return;
    }

    doCreateToken(email, password, name, days);
});

async function doCreateToken(email, password, name, days) {
    const id = randomId();
    // Unassigned tokens have NO expiry — they sit in the pool indefinitely.
    // Expiry is set only when the token is assigned (buy / redeem / admin-assign / reassign).
    try {
        await setDoc(doc(db, "customers", id), {
            nuvioEmail: email, nuvioPassword: password, name: name,
            status: 'active', assignedTo: null,
            expiresAt: null, createdAt: serverTimestamp(), notes: ''
        });
        showToast('Token created');
        closeModal('create-modal');
        loadTokens();
    } catch { showToast('Failed'); }
}

// ── Bulk ──
document.getElementById('bulk-btn').addEventListener('click', () => {
    document.getElementById('bulk-text').value = '';
    openModal('bulk-modal');
});
document.getElementById('bulk-submit').addEventListener('click', async () => {
    const text = document.getElementById('bulk-text').value.trim();
    if (!text) { showToast('Paste at least one line'); return; }
    const lines = text.split('\n').filter(l => l.trim());
    const btn = document.getElementById('bulk-submit');
    btn.textContent = `0/${lines.length}...`;
    btn.disabled = true;
    let success = 0;
    for (let i = 0; i < lines.length; i++) {
        const [email, password] = lines[i].split(',').map(s => s.trim());
        if (!email || !password) continue;
        const id = randomId();
        // Unassigned tokens have NO expiry — set on assignment.
        try {
            await setDoc(doc(db, "customers", id), {
                nuvioEmail: email, nuvioPassword: password, name: email,
                status: 'active', assignedTo: null,
                expiresAt: null, createdAt: serverTimestamp(), notes: ''
            });
            success++;
        } catch {}
        btn.textContent = `${i+1}/${lines.length}...`;
    }
    btn.textContent = 'Create All';
    btn.disabled = false;
    showToast(`Created ${success}/${lines.length}`);
    closeModal('bulk-modal');
    loadTokens();
});

// ── Edit ──
document.getElementById('edit-submit').addEventListener('click', async () => {
    const id = document.getElementById('edit-id').value;
    try {
        await updateDoc(doc(db, "customers", id), {
            nuvioEmail: document.getElementById('edit-email').value.trim(),
            nuvioPassword: document.getElementById('edit-password').value.trim(),
            name: document.getElementById('edit-name').value.trim(),
            notes: document.getElementById('edit-notes').value.trim()
        });
        showToast('Saved');
        closeModal('edit-modal');
        loadTokens();
    } catch { showToast('Failed'); }
});

// ── Renew: Add / Remove / Quick Set ──
document.getElementById('renew-add-btn').addEventListener('click', async () => {
    const id = document.getElementById('renew-id').value;
    const days = parseInt(document.getElementById('renew-days').value);
    if (!days || days < 1) { showToast('Enter valid days'); return; }
    const t = allTokens.find(x => x.id === id);
    if (!t) return;
    const s = getTokenStatus(t);
    const base = s.expiry.timestamp && !s.isExpired ? new Date(s.expiry.timestamp) : new Date();
    const newExpiry = new Date(base.getTime() + days * 86400000);
    try {
        await updateDoc(doc(db, "customers", id), { expiresAt: Timestamp.fromDate(newExpiry), status: 'active' });
        showToast(`Added ${days} days`);
        closeModal('renew-modal');
        loadTokens();
    } catch { showToast('Failed'); }
});

document.getElementById('renew-remove-btn').addEventListener('click', async () => {
    const id = document.getElementById('renew-id').value;
    const days = parseInt(document.getElementById('renew-days').value);
    if (!days || days < 1) { showToast('Enter valid days'); return; }
    const t = allTokens.find(x => x.id === id);
    if (!t) return;
    const s = getTokenStatus(t);
    const base = s.expiry.timestamp ? new Date(s.expiry.timestamp) : new Date();
    let newExpiry = new Date(base.getTime() - days * 86400000);
    if (newExpiry.getTime() < Date.now()) newExpiry = new Date();
    try {
        await updateDoc(doc(db, "customers", id), { expiresAt: Timestamp.fromDate(newExpiry) });
        showToast(`Removed ${days} days`);
        closeModal('renew-modal');
        loadTokens();
    } catch { showToast('Failed'); }
});

// Quick set fills the input (doesn't auto-apply)
document.querySelectorAll('.renew-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.getElementById('renew-days').value = btn.dataset.days;
    });
});

// ── Custom Assign ──
document.getElementById('assign-submit').addEventListener('click', async () => {
    const id = document.getElementById('assign-id').value;
    const email = document.getElementById('assign-email').value.trim().toLowerCase();
    if (!email) { showToast('Enter customer email'); return; }

    // Check if this email is already assigned to ANOTHER token
    const existingToken = allTokens.find(t =>
        t.id !== id &&
        (t.assignedTo || '').toLowerCase() === email &&
        t.assignedTo && t.assignedTo.trim() !== ''
    );

    if (existingToken) {
        // Show reassignment confirmation
        const oldExpiry = getExpiryInfo(existingToken.expiresAt);
        const daysLeft = oldExpiry.timestamp ? Math.max(0, Math.floor((oldExpiry.timestamp - Date.now()) / 86400000)) : 0;
        closeModal('assign-modal');
        showConfirm(
            'Reassign Account?',
            `${email} is currently assigned to ${existingToken.id} (${daysLeft} days left). Reassigning will move ${daysLeft} days to this token and unassign the old one. Continue?`,
            async () => {
                try {
                    // 1. Copy expiry from old token to new token
                    if (existingToken.expiresAt) {
                        await updateDoc(doc(db, "customers", id), {
                            assignedTo: email,
                            name: email,
                            status: 'active',
                            expiresAt: existingToken.expiresAt
                        });
                    } else {
                        await updateDoc(doc(db, "customers", id), {
                            assignedTo: email,
                            name: email,
                            status: 'active'
                        });
                    }
                    // 2. Unassign the old token
                    await updateDoc(doc(db, "customers", existingToken.id), {
                        assignedTo: null,
                        name: ''
                    });
                    showToast(`Reassigned from ${existingToken.id} (${daysLeft} days inherited)`);
                    loadTokens();
                } catch { showToast('Failed to reassign'); }
            }
        );
        return;
    }

    // No existing assignment — fresh assignment (e.g. pre-assign to a user who
    // hasn't signed up yet). Start the clock now with a 30-day default.
    // (Admin can adjust via the Renew modal afterward.)
    try {
        const freshExpiry = new Date(Date.now() + 30 * 86400000);
        await updateDoc(doc(db, "customers", id), {
            assignedTo: email,
            name: email,
            status: 'active',
            expiresAt: Timestamp.fromDate(freshExpiry)
        });
        showToast(`Assigned to ${email} (30 days)`);
        closeModal('assign-modal');
        loadTokens();
    } catch { showToast('Failed'); }
});

// ── Export ──
document.getElementById('export-btn').addEventListener('click', () => {
    const headers = ['Token ID', 'Nuvio Email', 'Nuvio Password', 'Name', 'Assigned To', 'Status', 'Expires', 'Notes'];
    const rows = allTokens.map(t => [
        t.id, t.nuvioEmail || '', t.nuvioPassword || '', t.name || '',
        t.assignedTo || '', t.status || '', t.expiresAt ? getExpiryInfo(t.expiresAt).text : '', t.notes || ''
    ]);
    const csv = [headers, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'nuvio-tokens.csv'; a.click();
    URL.revokeObjectURL(url);
    showToast('Exported');
});

// ── Search ──
document.getElementById('search-input').addEventListener('input', (e) => {
    searchTerm = e.target.value.toLowerCase().trim();
    renderTokens();
});

// ── Stat card click → filter ──
document.querySelectorAll('.stat-card').forEach(card => {
    card.addEventListener('click', () => {
        const filter = card.dataset.filter;
        currentFilter = (currentFilter === filter) ? 'all' : filter;
        document.querySelectorAll('.stat-card').forEach(c => c.classList.remove('active'));
        if (currentFilter !== 'all') {
            document.querySelector(`.stat-card[data-filter="${currentFilter}"]`)?.classList.add('active');
        }
        const indicator = document.getElementById('filter-indicator');
        const text = document.getElementById('filter-text');
        if (currentFilter !== 'all') {
            text.textContent = currentFilter.charAt(0).toUpperCase() + currentFilter.slice(1);
            indicator.classList.remove('hidden');
        } else {
            indicator.classList.add('hidden');
        }
        renderTokens();
    });
});

document.getElementById('clear-filter')?.addEventListener('click', () => {
    currentFilter = 'all';
    document.querySelectorAll('.stat-card').forEach(c => c.classList.remove('active'));
    document.getElementById('filter-indicator').classList.add('hidden');
    renderTokens();
});

// ── Refresh & Logout ──
document.getElementById('refresh-btn').addEventListener('click', loadTokens);
document.getElementById('logout-btn').addEventListener('click', logout);

// ── Promo Codes ──
// Collection: promoCodes/{code}
//   code: "NUVIO-XXXXXX", days: 7, createdAt: Timestamp, createdBy: "admin"
// Single-use: deleted by api/redeem.js when a customer redeems it.
let allPromoCodes = [];

function generatePromoCodeString() {
    // Unambiguous alphabet (no 0/O/1/I/L)
    const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
    const pick = (n) => Array.from({length: n}, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('');
    return `NUVIO-${pick(6)}`;
}

async function loadPromoCodes() {
    try {
        const snapshot = await getDocs(collection(db, "promoCodes"));
        allPromoCodes = [];
        snapshot.forEach(docSnap => { allPromoCodes.push({ id: docSnap.id, ...docSnap.data() }); });
        allPromoCodes.sort((a, b) => {
            const ta = a.createdAt?.toMillis?.() || a.createdAt?.seconds * 1000 || 0;
            const tb = b.createdAt?.toMillis?.() || b.createdAt?.seconds * 1000 || 0;
            return tb - ta; // newest first
        });
        renderPromoCodes();
    } catch (err) {
        console.error('Failed to load promo codes:', err);
        document.getElementById('promo-list').innerHTML = '<div class="loading-cell">Failed to load</div>';
    }
}

function renderPromoCodes() {
    const list = document.getElementById('promo-list');
    const countEl = document.getElementById('promo-count');
    countEl.textContent = `${allPromoCodes.length} active code${allPromoCodes.length !== 1 ? 's' : ''}`;
    if (allPromoCodes.length === 0) {
        list.innerHTML = '<div class="loading-cell" style="padding:28px">No active promo codes. Generate one above.</div>';
        return;
    }
    list.innerHTML = allPromoCodes.map(p => {
        const days = p.days || 7;
        let createdLabel = '';
        if (p.createdAt) {
            let ms;
            if (p.createdAt.toMillis) ms = p.createdAt.toMillis();
            else if (p.createdAt.seconds) ms = p.createdAt.seconds * 1000;
            else ms = new Date(p.createdAt).getTime();
            createdLabel = new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        }
        return `
        <div class="promo-item">
            <div class="promo-item-main">
                <code class="promo-code-text">${escapeHtml(p.id)}</code>
                <span class="badge badge-green">${days}d</span>
                ${createdLabel ? `<span class="promo-date">${createdLabel}</span>` : ''}
            </div>
            <div class="promo-item-actions">
                <button class="icon-btn" title="Copy code" onclick="copyPromoCode('${escapeJs(p.id)}')">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                </button>
                <button class="icon-btn danger" title="Delete code" onclick="confirmDeletePromo('${escapeJs(p.id)}')">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6"></path><path d="M10 11v6M14 11v6"></path></svg>
                </button>
            </div>
        </div>`;
    }).join('');
}

window.copyPromoCode = (code) => {
    navigator.clipboard.writeText(code);
    showToast('Code copied');
};

window.confirmDeletePromo = (code) => {
    showConfirm('Delete Promo Code', `Delete "${code}"? It will no longer be redeemable. This cannot be undone.`, async () => {
        try {
            await deleteDoc(doc(db, "promoCodes", code));
            showToast('Promo code deleted');
            loadPromoCodes();
        } catch { showToast('Failed'); }
    });
};

// Open promo modal
document.getElementById('promo-btn').addEventListener('click', () => {
    openModal('promo-modal');
    loadPromoCodes();
});

// Generate promo codes
document.getElementById('promo-generate-btn').addEventListener('click', async () => {
    const qty = Math.min(50, Math.max(1, parseInt(document.getElementById('promo-qty').value) || 1));
    const days = Math.min(365, Math.max(1, parseInt(document.getElementById('promo-days').value) || 7));
    const btn = document.getElementById('promo-generate-btn');
    btn.disabled = true;
    btn.textContent = `Generating 0/${qty}...`;
    let success = 0;
    const generated = [];
    for (let i = 0; i < qty; i++) {
        // Ensure unique code (avoid collisions within this batch + existing)
        let code;
        let attempts = 0;
        do {
            code = generatePromoCodeString();
            attempts++;
        } while ((allPromoCodes.some(p => p.id === code) || generated.includes(code)) && attempts < 10);
        try {
            await setDoc(doc(db, "promoCodes", code), {
                code, days,
                createdAt: serverTimestamp(),
                createdBy: 'admin'
            });
            generated.push(code);
            success++;
        } catch (err) {
            console.error('Failed to create promo code:', err);
        }
        btn.textContent = `Generating ${i+1}/${qty}...`;
    }
    btn.disabled = false;
    btn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg> Generate`;
    showToast(`Generated ${success}/${qty} code${success !== 1 ? 's' : ''}`);
    if (success > 0) loadPromoCodes();
});

// Copy all codes
document.getElementById('promo-copy-all-btn').addEventListener('click', () => {
    if (allPromoCodes.length === 0) { showToast('No codes to copy'); return; }
    const text = allPromoCodes.map(p => p.id).join('\n');
    navigator.clipboard.writeText(text);
    showToast(`Copied ${allPromoCodes.length} codes`);
});

// ── Login Events ──
document.getElementById('login-btn').addEventListener('click', login);
document.getElementById('password-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') login();
});

// ── Init ──
(async () => {
    const saved = localStorage.getItem('nuvio_auth');
    if (saved && saved === ADMIN_PASSWORD_HASH) {
        showApp();
    } else {
        if (saved) localStorage.removeItem('nuvio_auth');
        document.getElementById('login-overlay').classList.remove('hidden');
        document.getElementById('password-input').focus();
    }
})();
