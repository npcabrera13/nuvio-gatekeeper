import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
    getFirestore, collection, onSnapshot,
    doc, setDoc, updateDoc, deleteDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// ── Configuration ──────────────────────────────────────────────────────────
const ADMIN_PASSWORD = "nuvio";

const firebaseConfig = {
    apiKey: "AIzaSyDY4xB7sSFdEIOzwVo9rLLIqfs6E6qJf2c",
    authDomain: "nuvio-f00b0.firebaseapp.com",
    projectId: "nuvio-f00b0",
    storageBucket: "nuvio-f00b0.firebasestorage.app",
    messagingSenderId: "911411655425",
    appId: "1:911411655425:web:9f2b749425ebae57346100"
};

// ── Firebase Init ───────────────────────────────────────────────────────────
const app = initializeApp(firebaseConfig);
const db  = getFirestore(app);
const customersRef = collection(db, "customers");

// ── DOM Refs ────────────────────────────────────────────────────────────────
const loginOverlay  = document.getElementById('login-overlay');
const passwordInput = document.getElementById('password-input');
const loginBtn      = document.getElementById('login-btn');
const loginError    = document.getElementById('login-error');
const dashboard     = document.getElementById('dashboard');
const newUserName   = document.getElementById('new-user-name');
const newUserDays   = document.getElementById('new-user-days');
const generateBtn   = document.getElementById('generate-btn');
const tbody         = document.getElementById('customers-body');
const spinner       = document.getElementById('loading-spinner');
const emptyState    = document.getElementById('empty-state');
const statTotal     = document.getElementById('total-users');
const statActive    = document.getElementById('active-users');
const statBlocked   = document.getElementById('blocked-users');
const filterTotal   = document.getElementById('filter-total');
const filterActive  = document.getElementById('filter-active');
const filterBlocked = document.getElementById('filter-blocked');
const toastEl       = document.getElementById('toast');

// ── Toast Utility ───────────────────────────────────────────────────────────
let toastTimer = null;
function showToast(msg, type = 'info') {
    toastEl.textContent = msg;
    toastEl.className = 'toast show';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toastEl.className = 'toast'; }, 3000);
}

// ── Modal Helpers ───────────────────────────────────────────────────────────
window.closeModal = (id) => document.getElementById(id).classList.remove('active');

function openModal(id) {
    document.getElementById(id).classList.add('active');
}

// Close modal when clicking backdrop
document.querySelectorAll('.overlay').forEach(overlay => {
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) overlay.classList.remove('active');
    });
});

// ── Login ───────────────────────────────────────────────────────────────────
function enterDashboard() {
    loginOverlay.classList.remove('active');
    dashboard.classList.remove('hidden');
    loadData();
}

if (localStorage.getItem('nuvio_auth') === ADMIN_PASSWORD) {
    enterDashboard();
}

loginBtn.addEventListener('click', () => {
    if (passwordInput.value === ADMIN_PASSWORD) {
        localStorage.setItem('nuvio_auth', ADMIN_PASSWORD);
        enterDashboard();
    } else {
        loginError.textContent = "Incorrect password. Try again.";
        passwordInput.value = '';
        passwordInput.focus();
    }
});

passwordInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') loginBtn.click();
});

// ── SVG Icons ───────────────────────────────────────────────────────────────
const ICONS = {
    copy: `<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`,
    edit: `<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4z"/></svg>`,
    renew: `<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>`,
    block: `<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>`,
    unblock: `<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></svg>`,
    trash: `<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>`,
};

// ── Expiry Helpers ──────────────────────────────────────────────────────────
function getExpiryInfo(expiresAt) {
    if (!expiresAt) return { text: 'No expiry', daysLabel: null, cssClass: '' };

    const expDate = new Date(expiresAt.toMillis());
    const dateStr = expDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const now = Date.now();
    const diff = expDate.getTime() - now;
    const days = diff / (1000 * 3600 * 24);

    if (days < 0) {
        return { text: dateStr, daysLabel: 'Expired', cssClass: 'days-expired', isExpired: true };
    }

    let daysLabel;
    if (days < 1) {
        const hrs = Math.round(days * 24);
        daysLabel = hrs < 1 ? '< 1h left' : `${hrs}h left`;
    } else {
        daysLabel = `${Math.ceil(days)}d left`;
    }

    const cssClass = days <= 3 ? 'days-warn' : 'days-ok';
    return { text: dateStr, daysLabel, cssClass, isExpired: false };
}

// Format a JS Date to YYYY-MM-DD for <input type="date">
function toDateInputValue(date) {
    const d = new Date(date);
    const yyyy = d.getFullYear();
    const mm   = String(d.getMonth() + 1).padStart(2, '0');
    const dd   = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}

// ── Load Data (Real-time) ───────────────────────────────────────────────────
function loadData() {
    spinner.style.display = 'block';
    emptyState.classList.add('hidden');

    onSnapshot(customersRef, (snapshot) => {
        spinner.style.display = 'none';
        tbody.innerHTML = '';

        let activeCount = 0, blockedCount = 0;

        if (snapshot.empty) {
            emptyState.classList.remove('hidden');
            statTotal.textContent   = 0;
            statActive.textContent  = 0;
            statBlocked.textContent = 0;
            return;
        }

        emptyState.classList.add('hidden');

        snapshot.forEach((docSnap) => {
            const data   = docSnap.data();
            const id     = docSnap.id;
            const name   = data.name   || 'Unnamed';
            const notes  = data.notes  || '';
            const status = data.status || 'blocked';
            const createdStr = data.createdAt
                ? new Date(data.createdAt.toMillis()).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                : 'N/A';

            const expiry = getExpiryInfo(data.expiresAt);
            const isBlocked  = status !== 'active';
            const isExpired  = expiry.isExpired;
            const isInactive = isBlocked || isExpired;

            if (!isInactive) activeCount++;
            else blockedCount++;

            // ── Status Badge ──
            let badge = '';
            if (isExpired) {
                badge = `<span class="badge badge-expired">Expired</span>`;
            } else if (isBlocked) {
                badge = `<span class="badge badge-blocked">Blocked</span>`;
            } else {
                badge = `<span class="badge badge-active">Active</span>`;
            }

            // ── Expiry Cell ──
            const expiryCell = expiry.daysLabel
                ? `<span class="expires-text">${expiry.text}</span>
                   <span class="expires-days ${expiry.cssClass}">${expiry.daysLabel}</span>`
                : `<span class="expires-text">${expiry.text}</span>`;

            const expiresIso  = data.expiresAt ? toDateInputValue(new Date(data.expiresAt.toMillis())) : '';
            const expiresMillis = data.expiresAt ? data.expiresAt.toMillis() : 0;

            const tr = document.createElement('tr');

            // Store ALL data on dataset — never interpolated into HTML strings
            tr.dataset.id         = id;
            tr.dataset.name       = name;
            tr.dataset.notes      = notes;
            tr.dataset.expiresIso = expiresIso;
            tr.dataset.expiresMs  = expiresMillis;
            tr.dataset.status     = status;

            tr.innerHTML = `
                <td data-label="Customer">
                    <div>
                        <span class="customer-name"></span>
                        <span class="customer-notes"></span>
                    </div>
                </td>
                <td data-label="Token ID"><span class="token-id"></span></td>
                <td data-label="Expires">${expiryCell}</td>
                <td data-label="Status">${badge}</td>
                <td data-label="Actions">
                    <div class="actions">
                        <button class="btn-icon btn-copy"   data-action="copy"   data-tip="Copy Link">${ICONS.copy}</button>
                        <button class="btn-icon btn-edit"   data-action="edit"   data-tip="Edit">${ICONS.edit}</button>
                        <button class="btn-icon btn-renew"  data-action="renew"  data-tip="Adjust Days">${ICONS.renew}</button>
                        <button class="btn-icon ${isBlocked ? 'btn-unblock' : 'btn-block'}" data-action="toggle" data-tip="${isBlocked ? 'Unblock' : 'Block'}">${isBlocked ? ICONS.unblock : ICONS.block}</button>
                        <button class="btn-icon btn-delete" data-action="delete" data-tip="Delete">${ICONS.trash}</button>
                    </div>
                </td>
            `;

            // Set text safely via textContent (immune to any special characters)
            tr.querySelector('.customer-name').textContent = name;
            const notesEl = tr.querySelector('.customer-notes');
            if (notes) { notesEl.textContent = notes; notesEl.title = notes; }
            else        { notesEl.style.display = 'none'; }
            tr.querySelector('.token-id').textContent = id;

            tbody.appendChild(tr);
        });

        statTotal.textContent   = snapshot.size;
        statActive.textContent  = activeCount;
        statBlocked.textContent = blockedCount;
        
        applyFilter();

    }, (err) => {
        console.error(err);
        showToast('❌ Failed to load database.', 'error');
    });
}

// ── Filtering Logic ─────────────────────────────────────────────────────────
let currentFilter = 'total'; // 'total', 'active', 'blocked'

function applyFilter() {
    const rows = tbody.querySelectorAll('tr');
    rows.forEach(row => {
        const isExpired = row.querySelector('.badge-expired') !== null;
        const isBlocked = row.querySelector('.badge-blocked') !== null;
        const isInactive = isExpired || isBlocked;
        
        let shouldShow = true;
        if (currentFilter === 'active') shouldShow = !isInactive;
        if (currentFilter === 'blocked') shouldShow = isInactive;

        if (shouldShow) {
            row.classList.remove('hidden-row');
        } else {
            row.classList.add('hidden-row');
        }
    });

    filterTotal.classList.toggle('active-filter', currentFilter === 'total');
    filterActive.classList.toggle('active-filter', currentFilter === 'active');
    filterBlocked.classList.toggle('active-filter', currentFilter === 'blocked');
}

filterTotal.addEventListener('click', () => { currentFilter = 'total'; applyFilter(); });
filterActive.addEventListener('click', () => { currentFilter = 'active'; applyFilter(); });
filterBlocked.addEventListener('click', () => { currentFilter = 'blocked'; applyFilter(); });

// ── Delegated click handler — reads from dataset, never from HTML strings ───
tbody.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const tr     = btn.closest('tr');
    const id     = tr.dataset.id;
    const name   = tr.dataset.name;
    const notes  = tr.dataset.notes;
    const expIso = tr.dataset.expiresIso;
    const expMs  = tr.dataset.expiresMs;
    const status = tr.dataset.status;

    switch (btn.dataset.action) {
        case 'copy':   window.copyLink(id); break;
        case 'edit':   window.openEdit(id, name, notes, expIso, id); break;
        case 'renew':  window.openRenew(id, name, expMs); break;
        case 'toggle': window.toggleStatus(id, status === 'active' ? 'blocked' : 'active'); break;
        case 'delete': window.deleteToken(id); break;
    }
});

// ── Generate Token ──────────────────────────────────────────────────────────
generateBtn.addEventListener('click', async () => {
    const nameVal = newUserName.value.trim() || 'Unnamed Customer';
    const daysVal = parseInt(newUserDays.value) || 30;

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + daysVal);

    const randomId = 'nuvio_' + Math.random().toString(36).substr(2, 9);
    generateBtn.disabled = true;

    try {
        await setDoc(doc(db, "customers", randomId), {
            name:      nameVal,
            status:    'active',
            createdAt: serverTimestamp(),
            expiresAt,
            notes:     ''
        });
        showToast(`✅ Token created for ${nameVal}`);
        newUserName.value = '';
        newUserDays.value = '30';
    } catch (e) {
        console.error(e);
        showToast('❌ Failed to create token.');
    } finally {
        generateBtn.disabled = false;
    }
});

// ── Toggle Block/Unblock ────────────────────────────────────────────────────
window.toggleStatus = async (id, newStatus) => {
    const label = newStatus === 'blocked' ? 'block' : 'unblock';
    if (!confirm(`Are you sure you want to ${label} this customer?`)) return;
    try {
        await updateDoc(doc(db, "customers", id), { status: newStatus });
        showToast(`✅ Customer ${newStatus === 'blocked' ? 'blocked' : 'unblocked'}.`);
    } catch (e) {
        console.error(e);
        showToast('❌ Failed to update status.');
    }
};

// ── Copy Link (Multi-Addon Support) ─────────────────────────────────────────
// Available addon keys must match the ADDON_REGISTRY in api/proxy.js
const COPY_OPTIONS = [
    { label: '🎯 Bundle (All Addons)',  path: (id) => `${id}/manifest.json` },
    { label: '🔥 Torrentio Only',       path: (id) => `${id}/torrentio/manifest.json` },
    // Add more addons here as you register them in proxy.js:
    // { label: '☄️ Comet Only',         path: (id) => `${id}/comet/manifest.json` },
];

window.copyLink = (id) => {
    // If only one option, copy immediately
    if (COPY_OPTIONS.length === 1) {
        const baseUrl = window.location.origin;
        const link = `${baseUrl}/${COPY_OPTIONS[0].path(id)}`;
        navigator.clipboard.writeText(link)
            .then(() => showToast('📋 Stremio link copied!'))
            .catch(() => showToast('❌ Could not copy. Try manually.'));
        return;
    }

    // Show a small selection popup
    const existing = document.getElementById('copy-menu');
    if (existing) existing.remove();

    const menu = document.createElement('div');
    menu.id = 'copy-menu';
    menu.className = 'copy-menu glass-card';
    menu.innerHTML = `
        <div class="copy-menu-title">Copy link for:</div>
        ${COPY_OPTIONS.map((opt, i) => `
            <button class="copy-menu-btn" data-idx="${i}">${opt.label}</button>
        `).join('')}
    `;
    document.body.appendChild(menu);

    menu.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-idx]');
        if (!btn) return;
        const idx = parseInt(btn.dataset.idx);
        const baseUrl = window.location.origin;
        const link = `${baseUrl}/${COPY_OPTIONS[idx].path(id)}`;
        navigator.clipboard.writeText(link)
            .then(() => showToast(`📋 ${COPY_OPTIONS[idx].label} link copied!`))
            .catch(() => showToast('❌ Could not copy. Try manually.'));
        menu.remove();
    });

    // Close on outside click
    setTimeout(() => {
        document.addEventListener('click', function closer(e) {
            if (!menu.contains(e.target)) {
                menu.remove();
                document.removeEventListener('click', closer);
            }
        });
    }, 10);
};

// ── Edit Modal ──────────────────────────────────────────────────────────────
window.openEdit = (id, name, notes, expiresIso, tokenId) => {
    document.getElementById('edit-id').value       = id;
    document.getElementById('edit-token-id').value = tokenId || id;
    document.getElementById('edit-name').value     = name;
    document.getElementById('edit-notes').value    = notes;
    document.getElementById('edit-expires').value  = expiresIso;
    openModal('edit-modal');
};

document.getElementById('save-edit-btn').addEventListener('click', async () => {
    const oldId      = document.getElementById('edit-id').value;
    const newTokenId = document.getElementById('edit-token-id').value.trim();
    const name       = document.getElementById('edit-name').value.trim() || 'Unnamed';
    const notes      = document.getElementById('edit-notes').value.trim();
    const expiresVal = document.getElementById('edit-expires').value;

    // Validate token ID
    if (!newTokenId) return showToast('❌ Token ID cannot be empty.');
    if (!/^[a-zA-Z0-9_-]+$/.test(newTokenId)) return showToast('❌ Token ID can only contain letters, numbers, _ and -');

    const updates = { name, notes };
    if (expiresVal) {
        const [yyyy, mm, dd] = expiresVal.split('-').map(Number);
        updates.expiresAt = new Date(yyyy, mm - 1, dd, 23, 59, 59);
    }

    const saveBtn = document.getElementById('save-edit-btn');
    saveBtn.disabled = true;

    try {
        if (newTokenId !== oldId) {
            // Rename = copy data to new doc ID + delete old one
            // First get the existing doc's full data so we preserve createdAt etc.
            const { getDoc } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js');
            const snap = await getDoc(doc(db, 'customers', oldId));
            if (!snap.exists()) return showToast('❌ Original token not found.');
            const existing = snap.data();
            // Merge updates into existing data
            const newData = { ...existing, ...updates };
            await setDoc(doc(db, 'customers', newTokenId), newData);
            await deleteDoc(doc(db, 'customers', oldId));
            showToast(`✅ Token renamed to ${newTokenId}`);
        } else {
            await updateDoc(doc(db, 'customers', oldId), updates);
            showToast('✅ Customer updated.');
        }
        closeModal('edit-modal');
    } catch (e) {
        console.error(e);
        showToast('❌ Failed to save changes.');
    } finally {
        saveBtn.disabled = false;
    }
});

// ── Renew Modal ─────────────────────────────────────────────────────────────
// Store the pending new expiry date
let _pendingExpiry = null;

window.openRenew = (id, name, currentExpiryMillis) => {
    _pendingExpiry = null;
    const confirmBtn = document.getElementById('confirm-renew-btn');
    confirmBtn.disabled = true;
    confirmBtn.textContent = 'Confirm Change';

    document.getElementById('renew-id').value = id;
    document.getElementById('renew-current-expiry').value = currentExpiryMillis || 0;
    document.getElementById('renew-title').textContent = `Adjusting days for ${name}`;
    document.getElementById('custom-renew-days').value = '';
    document.getElementById('renew-new-display').textContent = '—';
    document.getElementById('renew-preview-box').classList.remove('has-preview');

    // Show current expiry
    const millis = parseInt(currentExpiryMillis) || 0;
    if (millis > 0) {
        const d = new Date(millis);
        const days = Math.ceil((d.getTime() - Date.now()) / (1000 * 3600 * 24));
        const label = days < 0 ? 'Expired' : `${days}d left`;
        document.getElementById('renew-current-display').textContent =
            `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} (${label})`;
    } else {
        document.getElementById('renew-current-display').textContent = 'No expiry set';
    }

    // Deselect any previously highlighted preset button
    document.querySelectorAll('.renew-btn').forEach(b => b.classList.remove('btn-selected'));

    openModal('renew-modal');
};

window.previewRenew = (days) => {
    const n = parseInt(days);
    if (isNaN(n) || n === 0) return showToast('❌ Enter a non-zero number of days.');

    // Base: current expiry. If expired/no expiry, base off today.
    const millis = parseInt(document.getElementById('renew-current-expiry').value) || 0;
    const base = (millis > 0 && millis > Date.now()) ? new Date(millis) : new Date();

    const newDate = new Date(base);
    newDate.setDate(newDate.getDate() + n);

    // Prevent going before today
    if (newDate <= new Date()) {
        showToast('⚠️ That would expire the token immediately.');
        return;
    }

    _pendingExpiry = newDate;

    // Update preview display
    const daysFromNow = Math.ceil((newDate.getTime() - Date.now()) / (1000 * 3600 * 24));
    const dateStr = newDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    document.getElementById('renew-new-display').textContent = `${dateStr} (${daysFromNow}d left)`;
    document.getElementById('renew-preview-box').classList.add('has-preview');

    const action = n > 0 ? `+${n}` : `${n}`;
    const confirmBtn = document.getElementById('confirm-renew-btn');
    confirmBtn.disabled = false;
    confirmBtn.textContent = `Confirm (${action} days → ${daysFromNow}d left)`;

    // Highlight the clicked preset if it matches
    document.querySelectorAll('.renew-btn').forEach(b => b.classList.remove('btn-selected'));
};

window.confirmRenew = async () => {
    if (!_pendingExpiry) return;
    const id = document.getElementById('renew-id').value;
    const confirmBtn = document.getElementById('confirm-renew-btn');
    confirmBtn.disabled = true;

    try {
        await updateDoc(doc(db, 'customers', id), {
            expiresAt: _pendingExpiry,
            status:    'active'
        });
        const daysFromNow = Math.ceil((_pendingExpiry.getTime() - Date.now()) / (1000 * 3600 * 24));
        closeModal('renew-modal');
        showToast(`✅ Updated! New expiry: ${daysFromNow}d from now.`);
        _pendingExpiry = null;
    } catch (e) {
        console.error(e);
        showToast('❌ Failed to update expiry.');
        confirmBtn.disabled = false;
    }
};

// ── Delete Token ────────────────────────────────────────────────────────────
window.deleteToken = async (id) => {
    if (!confirm(`Permanently delete token "${id}"?\n\nThis cannot be undone.`)) return;
    try {
        await deleteDoc(doc(db, "customers", id));
        showToast('🗑️ Token deleted.');
    } catch (e) {
        console.error(e);
        showToast('❌ Failed to delete token.');
    }
};
