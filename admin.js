import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
    getFirestore, collection, getDocs,
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

// ── Load Tokens (the ONLY read operation) ──
async function loadTokens() {
    try {
        const snapshot = await getDocs(collection(db, "customers"));
        allTokens = [];
        snapshot.forEach(docSnap => {
            const data = docSnap.data();
            allTokens.push({ id: docSnap.id, ...data });
        });
        renderTokens();
    } catch (err) {
        console.error('Failed to load:', err);
        showToast('Failed to load tokens');
    }
}

// ── Render ──
function renderTokens() {
    const tbody = document.getElementById('tokens-tbody');
    const noResults = document.getElementById('no-results');
    const countEl = document.getElementById('result-count');

    let filtered = allTokens.filter(t => {
        // Filter
        const assignedTo = t.assignedTo || '';
        const isAssigned = assignedTo && assignedTo.trim() !== '';
        const status = t.status || 'active';
        const expiry = getExpiryInfo(t.expiresAt);
        const isBlocked = status !== 'active';
        const isExpired = expiry.isExpired;

        if (currentFilter === 'available' && (isAssigned || isBlocked)) return false;
        if (currentFilter === 'assigned' && !isAssigned) return false;
        if (currentFilter === 'blocked' && !isBlocked && !isExpired) return false;

        // Search
        if (searchTerm) {
            const haystack = [
                t.id, t.nuvioEmail, t.nuvioPassword, t.name, t.assignedTo, t.notes
            ].filter(Boolean).join(' ').toLowerCase();
            if (!haystack.includes(searchTerm)) return false;
        }
        return true;
    });

    countEl.textContent = `${filtered.length} token${filtered.length !== 1 ? 's' : ''}`;

    if (filtered.length === 0) {
        tbody.innerHTML = '';
        noResults.classList.remove('hidden');
        return;
    }
    noResults.classList.add('hidden');

    tbody.innerHTML = filtered.map(t => {
        const assignedTo = t.assignedTo || '';
        const isAssigned = assignedTo && assignedTo.trim() !== '';
        const status = t.status || 'active';
        const expiry = getExpiryInfo(t.expiresAt);
        const isBlocked = status !== 'active';

        // Status badge
        let statusBadge;
        if (isBlocked && isExpired) statusBadge = '<span class="badge badge-red">Expired</span>';
        else if (isBlocked) statusBadge = '<span class="badge badge-red">Blocked</span>';
        else if (isExpired) statusBadge = '<span class="badge badge-amber">Expired</span>';
        else if (isAssigned) statusBadge = '<span class="badge badge-amber">Assigned</span>';
        else statusBadge = '<span class="badge badge-green">Available</span>';

        // Assigned badge
        let assignedBadge;
        if (isAssigned) {
            assignedBadge = `<span class="badge badge-muted">${escapeHtml(assignedTo)}</span>`;
        } else {
            assignedBadge = '<span style="color:var(--text-dim)">—</span>';
        }

        const name = t.name || (isAssigned ? escapeHtml(assignedTo) : '—');

        return `
        <tr>
            <td>${escapeHtml(name)}</td>
            <td><code style="font-size:11px;color:var(--text-muted)">${escapeHtml(t.id)}</code></td>
            <td>${t.nuvioEmail ? escapeHtml(t.nuvioEmail) : '<span style="color:var(--text-dim)">—</span>'}</td>
            <td>${t.nuvioPassword ? escapeHtml(t.nuvioPassword) : '<span style="color:var(--text-dim)">—</span>'}</td>
            <td>${assignedBadge}</td>
            <td>
                <div>${expiry.text}</div>
                <div style="font-size:11px;color:var(--text-dim)">${expiry.daysLabel}</div>
            </td>
            <td>${statusBadge}</td>
            <td>
                <div class="action-btns">
                    ${t.nuvioEmail && t.nuvioPassword ? `
                    <button class="icon-btn copy" title="Copy credentials" onclick="copyCreds('${escapeHtml(t.nuvioEmail)}','${escapeHtml(t.nuvioPassword)}')">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                    </button>` : ''}
                    <button class="icon-btn copy" title="Copy addon link" onclick="copyLink('${escapeHtml(t.id)}')">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>
                    </button>
                    <button class="icon-btn" title="Edit" onclick="openEdit('${escapeHtml(t.id)}')">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                    </button>
                    <button class="icon-btn" title="Renew" onclick="openRenew('${escapeHtml(t.id)}')">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"></polyline><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path></svg>
                    </button>
                    ${isAssigned ? `<button class="icon-btn" title="Unassign" onclick="unassign('${escapeHtml(t.id)}')">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="8.5" cy="7" r="4"></circle><line x1="23" y1="11" x2="17" y2="11"></line></svg>
                    </button>` : ''}
                    <button class="icon-btn" title="${isBlocked ? 'Unblock' : 'Block'}" onclick="toggleBlock('${escapeHtml(t.id)}','${escapeHtml(status)}')">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle>${isBlocked ? '<line x1="4.93" y1="4.93" x2="19.07" y2="19.07"></line>' : '<line x1="1" y1="1" x2="23" y2="23"></line>'}</svg>
                    </button>
                    <button class="icon-btn danger" title="Delete" onclick="deleteToken('${escapeHtml(t.id)}')">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                    </button>
                </div>
            </td>
        </tr>`;
    }).join('');
}

// ── Actions ──
window.copyCreds = (email, pass) => {
    navigator.clipboard.writeText(`Email: ${email}\nPassword: ${pass}`);
    showToast('Credentials copied');
};

window.copyLink = (tokenId) => {
    navigator.clipboard.writeText(`https://nuviostreamapi.vercel.app/${tokenId}/manifest.json`);
    showToast('Addon link copied');
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
    const expiry = getExpiryInfo(t.expiresAt);
    document.getElementById('renew-info').textContent = `Current expiry: ${expiry.text} (${expiry.daysLabel || 'no expiry'})`;
    document.getElementById('renew-days').value = '';
    openModal('renew-modal');
};

window.unassign = async (id) => {
    if (!confirm('Unassign this token? It will become available again.')) return;
    try {
        await updateDoc(doc(db, "customers", id), { assignedTo: null, name: '' });
        showToast('Token unassigned');
        loadTokens();
    } catch (err) { showToast('Failed to unassign'); }
};

window.toggleBlock = async (id, currentStatus) => {
    const newStatus = currentStatus === 'active' ? 'blocked' : 'active';
    try {
        await updateDoc(doc(db, "customers", id), { status: newStatus });
        showToast(newStatus === 'blocked' ? 'Token blocked' : 'Token unblocked');
        loadTokens();
    } catch (err) { showToast('Failed to toggle'); }
};

window.deleteToken = async (id) => {
    if (!confirm(`Delete token "${id}"? This cannot be undone.`)) return;
    try {
        await deleteDoc(doc(db, "customers", id));
        showToast('Token deleted');
        loadTokens();
    } catch (err) { showToast('Failed to delete'); }
};

window.openModal = (id) => document.getElementById(id).classList.remove('hidden');
window.closeModal = (id) => document.getElementById(id).classList.add('hidden');

// ── Create Token ──
document.getElementById('create-btn').addEventListener('click', () => {
    ['create-email','create-password','create-name'].forEach(id => document.getElementById(id).value = '');
    document.getElementById('create-days').value = '30';
    openModal('create-modal');
});

document.getElementById('create-submit').addEventListener('click', async () => {
    const email = document.getElementById('create-email').value.trim();
    const password = document.getElementById('create-password').value.trim();
    const name = document.getElementById('create-name').value.trim();
    const days = parseInt(document.getElementById('create-days').value) || 30;

    if (!email || !password) { showToast('Email and password required'); return; }

    const id = randomId();
    const expires = new Date(Date.now() + days * 86400000);

    try {
        await setDoc(doc(db, "customers", id), {
            nuvioEmail: email,
            nuvioPassword: password,
            name: name,
            status: 'active',
            assignedTo: null,
            expiresAt: Timestamp.fromDate(expires),
            createdAt: serverTimestamp(),
            notes: ''
        });
        showToast('Token created');
        closeModal('create-modal');
        loadTokens();
    } catch (err) { showToast('Failed to create token'); }
});

// ── Bulk Create ──
document.getElementById('bulk-btn').addEventListener('click', () => {
    document.getElementById('bulk-text').value = '';
    openModal('bulk-modal');
});

document.getElementById('bulk-submit').addEventListener('click', async () => {
    const text = document.getElementById('bulk-text').value.trim();
    if (!text) { showToast('Paste at least one line'); return; }

    const lines = text.split('\n').filter(l => l.trim());
    const btn = document.getElementById('bulk-submit');
    btn.textContent = `Creating 0/${lines.length}...`;
    btn.disabled = true;

    let success = 0;
    for (let i = 0; i < lines.length; i++) {
        const [email, password] = lines[i].split(',').map(s => s.trim());
        if (!email || !password) continue;
        const id = randomId();
        const expires = new Date(Date.now() + 30 * 86400000);
        try {
            await setDoc(doc(db, "customers", id), {
                nuvioEmail: email, nuvioPassword: password, name: email,
                status: 'active', assignedTo: null,
                expiresAt: Timestamp.fromDate(expires), createdAt: serverTimestamp(), notes: ''
            });
            success++;
        } catch (err) { console.error('Failed:', email, err); }
        btn.textContent = `Creating ${i+1}/${lines.length}...`;
    }

    btn.textContent = 'Create All';
    btn.disabled = false;
    showToast(`Created ${success}/${lines.length} tokens`);
    closeModal('bulk-modal');
    loadTokens();
});

// ── Edit Submit ──
document.getElementById('edit-submit').addEventListener('click', async () => {
    const id = document.getElementById('edit-id').value;
    const email = document.getElementById('edit-email').value.trim();
    const password = document.getElementById('edit-password').value.trim();
    const name = document.getElementById('edit-name').value.trim();
    const notes = document.getElementById('edit-notes').value.trim();

    try {
        await updateDoc(doc(db, "customers", id), {
            nuvioEmail: email, nuvioPassword: password, name: name, notes: notes
        });
        showToast('Token updated');
        closeModal('edit-modal');
        loadTokens();
    } catch (err) { showToast('Failed to update'); }
});

// ── Renew Submit ──
document.querySelectorAll('.renew-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.getElementById('renew-days').value = btn.dataset.days;
    });
});

document.getElementById('renew-submit').addEventListener('click', async () => {
    const id = document.getElementById('renew-id').value;
    const days = parseInt(document.getElementById('renew-days').value);
    if (!days || days < 1) { showToast('Enter valid days'); return; }

    const newExpiry = new Date(Date.now() + days * 86400000);
    try {
        await updateDoc(doc(db, "customers", id), {
            expiresAt: Timestamp.fromDate(newExpiry), status: 'active'
        });
        showToast(`Renewed to ${days} days`);
        closeModal('renew-modal');
        loadTokens();
    } catch (err) { showToast('Failed to renew'); }
});

// ── Export CSV ──
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
    showToast('CSV exported');
});

// ── Search & Filter ──
document.getElementById('search-input').addEventListener('input', (e) => {
    searchTerm = e.target.value.toLowerCase().trim();
    renderTokens();
});

document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentFilter = btn.dataset.filter;
        renderTokens();
    });
});

// ── Refresh & Logout ──
document.getElementById('refresh-btn').addEventListener('click', loadTokens);
document.getElementById('logout-btn').addEventListener('click', logout);

// ── Login Events ──
document.getElementById('login-btn').addEventListener('click', login);
document.getElementById('password-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') login();
});

// ── Init ──
(async () => {
    const saved = localStorage.getItem('nuvio_auth');
    if (saved === ADMIN_PASSWORD_HASH) {
        showApp();
    } else {
        document.getElementById('login-overlay').classList.remove('hidden');
        document.getElementById('password-input').focus();
    }
})();
