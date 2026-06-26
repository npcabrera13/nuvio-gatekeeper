import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
    getFirestore, collection, getDocs,
    doc, getDoc, setDoc, updateDoc, deleteDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// ── Configuration ──────────────────────────────────────────────────────────
const ADMIN_PASSWORD_HASH = "7f5741fbd93481f422aa5d0373c8b1c0bce7d4b9fa900bc40ac8fc624011e98d";

async function hashStr(str) {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// Vite compatibility wrapper for vanilla Express setup
const envObj = (typeof import.meta !== 'undefined' && import.meta.env) ? import.meta.env : {};

const firebaseConfig = {
    apiKey: envObj.VITE_FIREBASE_API_KEY || "AIzaSyC4OXdfVs_mXPinhmpAt2su8WKZhUDXWoQ",
    authDomain: envObj.VITE_FIREBASE_AUTH_DOMAIN || "multiaddon.firebaseapp.com",
    projectId: envObj.VITE_FIREBASE_PROJECT_ID || "multiaddon",
    storageBucket: envObj.VITE_FIREBASE_STORAGE_BUCKET || "multiaddon.firebasestorage.app",
    messagingSenderId: envObj.VITE_FIREBASE_MESSAGING_SENDER_ID || "963978475190",
    appId: envObj.VITE_FIREBASE_APP_ID || "1:963978475190:web:6796687180b021e049d817"
};

const app = initializeApp(firebaseConfig);
const db  = getFirestore(app);
const customersRef = collection(db, "customers");

// ── Hardcoded Addons (must match api/proxy.js) ───────────────────────────────
const ADDONS = [
    { name: "Torrentio",      url: "https://torrentio.strem.fun/qualityfilter=hdrall,4k,brremux,dolbyvision,dolbyvisionwithhdr/manifest.json", canBlock: true },
    { name: "Open Subtitles", url: "https://opensubtitles-v3.strem.io/manifest.json", canBlock: false },
    { name: "Cinemata",       url: "https://v3-cinemeta.strem.io/manifest.json", canBlock: false },
    { name: "Anime Kitsu",    url: "https://anime-kitsu.strem.fun/manifest.json", canBlock: false },
    { name: "AioMetadata",    url: "https://aiometadata.elfhosted.com/stremio/44fe3014-a2d0-42df-b050-8b5f9d152947/manifest.json", canBlock: false },
    { name: "PinoyTV",        url: "https://stiptv.ddns.me/eyJ1c2VYdHJlYW0iOmZhbHNlLCJtM3VVcmwiOiJodHRwczovL3Jhdy5naXRodWJ1c2VyY29udGVudC5jb20vbnBjYWJyZXJhMTMvbnV2aW8tZ2F0ZWtlZXBlci9tdWx0aWFkZG9uL21hc3Rlci1waC12Mi5tM3UiLCJlbmFibGVFcGciOmZhbHNlLCJpbnN0YW5jZUlkIjoiZGVmM2Y3OTAtMzViNi00NWFkLWJkMDItYWM3YjQ5MTU0YmM0In0=/manifest.json", canBlock: false },
    { name: "VIPChannels",     url: "https://stiptv.ddns.me/eyJ1c2VYdHJlYW0iOmZhbHNlLCJtM3VVcmwiOiJodHRwczovL3Jhdy5naXRodWJ1c2VyY29udGVudC5jb20vbnBjYWJyZXJhMTMvbnV2aW8tZ2F0ZWtlZXBlci9tdWx0aWFkZG9uL3ZpcC1jaGVycnktcGljay5tM3UiLCJlbmFibGVFcGciOmZhbHNlLCJpbnN0YW5jZUlkIjoiMzMzZjYxNjktY2FiYy00NjEyLWJkNzgtZjZiZTMyYjg1NTRiIn0=/manifest.json", canBlock: false }
];

// ── DOM Refs ────────────────────────────────────────────────────────────────
const loginOverlay  = document.getElementById('login-overlay');
const passwordInput = document.getElementById('password-input');
const loginBtn      = document.getElementById('login-btn');
const loginError    = document.getElementById('login-error');
const dashboard     = document.getElementById('dashboard');
const tbody         = document.getElementById('customers-body');
const spinner       = document.getElementById('loading-spinner');
const noCustomers   = document.getElementById('no-customers');
const statTotal     = document.getElementById('stat-total');
const statAvailable = document.getElementById('stat-available');
const statAssigned  = document.getElementById('stat-assigned');
const statBlocked   = document.getElementById('stat-blocked');

const bulkModal     = document.getElementById('bulk-modal');
const bulkInput     = document.getElementById('bulk-input');
const bulkDays      = document.getElementById('bulk-days');
const bulkGenerateBtn = document.getElementById('bulk-generate-btn');

const tokenModal    = document.getElementById('token-modal');
const modalTitle    = document.getElementById('modal-title');
const editTokenId   = document.getElementById('edit-token-id');
const modalName     = document.getElementById('modal-name');
const modalNotes    = document.getElementById('modal-notes');
const modalNuvioEmail = document.getElementById('modal-nuvio-email');
const modalNuvioPassword = document.getElementById('modal-nuvio-password');

const modalTokenKey = document.getElementById('modal-token-key');
const tokenKeyGroup = document.getElementById('token-key-group');
const modalDays     = document.getElementById('modal-days');
const daysGroup     = document.getElementById('days-group');
const saveTokenBtn  = document.getElementById('save-token-btn');



const renewModal    = document.getElementById('renew-modal');
const renewCustomerName = document.getElementById('renew-customer-name');
const renewDays     = document.getElementById('renew-days');
const confirmRenewBtn = document.getElementById('confirm-renew-btn');

const toastEl       = document.getElementById('toast');



// ── Toast Utility ───────────────────────────────────────────────────────────
let toastTimer = null;
function showToast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toastEl.classList.remove('show'); }, 3000);
}

// ── Modal Handlers ──────────────────────────────────────────────────────────
document.querySelectorAll('.close-modal').forEach(btn => {
    btn.addEventListener('click', () => {
        const targetId = btn.getAttribute('data-target');
        document.getElementById(targetId).classList.add('hidden');
    });
});

document.getElementById('open-bulk-modal').addEventListener('click', () => {
    bulkInput.value = '';
    bulkDays.value = '7';
    bulkModal.classList.remove('hidden');
});

document.getElementById('open-create-modal').addEventListener('click', () => {
    modalTitle.textContent = "Create New Token";
    editTokenId.value = '';
    modalName.value = '';
    modalNotes.value = '';
    modalNuvioEmail.value = '';
    modalNuvioPassword.value = '';
    modalDays.value = '7';
    modalTokenKey.value = '';
    tokenKeyGroup.classList.add('hidden');
    daysGroup.classList.remove('hidden');
    tokenModal.classList.remove('hidden');
});

document.getElementById('view-addons-btn').addEventListener('click', async () => {
    const listEl = document.getElementById('active-addons-list');
    listEl.innerHTML = `<div style="text-align: center; color: var(--text-muted); padding: 1.5rem;">Loading addons list...</div>`;
    document.getElementById('addons-modal').classList.remove('hidden');

    try {
        const res = await fetch('/api/status');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        
        if (data && data.addons && data.addons.length > 0) {
            listEl.innerHTML = '';
            data.addons.forEach(addon => {
                const item = document.createElement('div');
                item.className = 'premium-glass';
                item.style.padding = '0.75rem 1rem';
                item.style.borderRadius = '8px';
                item.style.display = 'flex';
                item.style.flexDirection = 'column';
                item.style.gap = '0.5rem';
                item.style.border = '1px solid rgba(255, 255, 255, 0.08)';
                
                // Header (Name + Tags)
                const header = document.createElement('div');
                header.style.display = 'flex';
                header.style.justifyContent = 'space-between';
                header.style.alignItems = 'center';

                const nameWrapper = document.createElement('div');
                nameWrapper.style.fontWeight = '600';
                nameWrapper.style.color = '#f8fafc';
                nameWrapper.textContent = addon.name;
                header.appendChild(nameWrapper);

                const resourcesWrapper = document.createElement('div');
                resourcesWrapper.style.fontSize = '0.7rem';
                resourcesWrapper.style.color = 'var(--text-muted)';
                resourcesWrapper.style.display = 'flex';
                resourcesWrapper.style.gap = '0.25rem';
                
                addon.resources.forEach(r => {
                    const tag = document.createElement('span');
                    tag.style.background = 'rgba(255, 255, 255, 0.05)';
                    tag.style.padding = '0.1rem 0.35rem';
                    tag.style.borderRadius = '4px';
                    tag.textContent = r;
                    resourcesWrapper.appendChild(tag);
                });
                header.appendChild(resourcesWrapper);
                item.appendChild(header);

                // URL section
                const urlContainer = document.createElement('div');
                urlContainer.style.display = 'flex';
                urlContainer.style.gap = '0.5rem';
                urlContainer.style.alignItems = 'center';
                urlContainer.style.marginTop = '0.25rem';

                const urlInput = document.createElement('input');
                urlInput.type = 'text';
                urlInput.className = 'form-input';
                urlInput.value = addon.url || '';
                urlInput.readOnly = true;
                urlInput.style.flex = '1';
                urlInput.style.fontSize = '0.75rem';
                urlInput.style.padding = '0.35rem 0.6rem';
                urlInput.style.height = 'auto';
                urlContainer.appendChild(urlInput);

                const copyBtn = document.createElement('button');
                copyBtn.className = 'btn btn-outline btn-sm';
                copyBtn.style.padding = '0.35rem 0.75rem';
                copyBtn.style.fontSize = '0.75rem';
                copyBtn.textContent = 'Copy';
                copyBtn.onclick = () => {
                    navigator.clipboard.writeText(addon.url)
                        .then(() => showToast('🔗 Copied addon URL!'))
                        .catch(() => {
                            urlInput.select();
                            document.execCommand('copy');
                            showToast('🔗 Copied addon URL!');
                        });
                };
                urlContainer.appendChild(copyBtn);
                item.appendChild(urlContainer);

                listEl.appendChild(item);
            });
        } else {
            listEl.innerHTML = `<div style="text-align: center; color: var(--text-muted); padding: 1.5rem;">No addons configured.</div>`;
        }
    } catch (err) {
        console.error("Error fetching status:", err);
        listEl.innerHTML = `<div style="text-align: center; color: #ef4444; padding: 1.5rem;">Error loading addons: ${err.message}</div>`;
    }
});

function openEditModal(id, dataStr) {
    const data = JSON.parse(decodeURIComponent(dataStr));
    modalTitle.textContent = "Edit Token";
    editTokenId.value = id;
    modalName.value = data.name || '';
    modalNotes.value = data.notes || '';
    modalNuvioEmail.value = data.nuvioEmail || '';
    modalNuvioPassword.value = data.nuvioPassword || '';
    modalTokenKey.value = id;
    tokenKeyGroup.classList.remove('hidden');
    daysGroup.classList.add('hidden'); // Editing days is done via Renew modal
    tokenModal.classList.remove('hidden');
}



// ── Save/Edit Token Logic ───────────────────────────────────────────────────
saveTokenBtn.addEventListener('click', async () => {
    const nameVal = modalName.value.trim();
    const isEdit = editTokenId.value !== '';
    
    saveTokenBtn.disabled = true;
    saveTokenBtn.textContent = isEdit ? "Saving..." : "Generating...";

    try {
        if (!isEdit) {
            // Create
            const days = parseInt(modalDays.value, 10);
            if (isNaN(days) || days < 1) throw new Error("Invalid days");
            
            const randomId = "nuvio_" + Math.random().toString(36).substring(2, 9);
            const expiresAt = new Date();
            expiresAt.setDate(expiresAt.getDate() + days);

            await setDoc(doc(db, "customers", randomId), {
                name: nameVal,
                status: 'active',
                createdAt: serverTimestamp(),
                expiresAt: expiresAt,
                nuvioEmail: modalNuvioEmail.value.trim(),
                nuvioPassword: modalNuvioPassword.value.trim(),
                assignedTo: null
            });
            showToast('✅ Token generated successfully.');
            
            // Auto copy bundle link immediately!
            copyToClipboard(`https://nuviostreamapi.vercel.app/${randomId}/manifest.json`);
            
        } else {
            // Edit
            const oldId = editTokenId.value;
            const newTokenId = modalTokenKey.value.trim();
            if (!newTokenId) throw new Error("Token ID cannot be empty");

            const nameVal = modalName.value.trim();
            const notesVal = modalNotes.value.trim();
            const updates = {
                name: nameVal,
                notes: notesVal,
                nuvioEmail: modalNuvioEmail.value.trim(),
                nuvioPassword: modalNuvioPassword.value.trim()
            };

            if (oldId !== newTokenId) {
                // Rename = copy data to new doc ID + delete old one
                const snap = await getDoc(doc(db, 'customers', oldId));
                if (!snap.exists()) throw new Error('Original token not found.');
                
                const newData = { ...snap.data(), ...updates };
                await setDoc(doc(db, 'customers', newTokenId), newData);
                await deleteDoc(doc(db, 'customers', oldId));
                showToast(`✅ Token renamed to ${newTokenId}`);
            } else {
                await updateDoc(doc(db, "customers", oldId), updates);
                showToast('✅ Token updated.');
            }
        }
        tokenModal.classList.add('hidden');
        loadData();
    } catch (e) {
        console.error(e);
        showToast('❌ ' + e.message);
    }
    
    saveTokenBtn.disabled = false;
    saveTokenBtn.textContent = isEdit ? "Save Changes" : "Generate Token";
});

bulkGenerateBtn.addEventListener('click', async () => {
    const text = bulkInput.value.trim();
    if (!text) return showToast('❌ No input provided.');
    
    const lines = text.split('\n').filter(l => l.trim() !== '');
    const days = parseInt(bulkDays.value, 10);
    if (isNaN(days) || days < 1) return showToast('❌ Invalid days.');
    
    bulkGenerateBtn.disabled = true;
    bulkGenerateBtn.textContent = `Creating 0/${lines.length}...`;
    
    let successCount = 0;
    let failCount = 0;
    
    for (const line of lines) {
        const parts = line.split(',');
        if (parts.length < 2) {
            failCount++;
            continue;
        }
        const email = parts[0].trim();
        const pwd = parts.slice(1).join(',').trim(); // in case password has commas
        
        try {
            const randomId = "nuvio_" + Math.random().toString(36).substring(2, 9);
            const expiresAt = new Date();
            expiresAt.setDate(expiresAt.getDate() + days);

            await setDoc(doc(db, "customers", randomId), {
                name: email,
                status: 'active',
                createdAt: serverTimestamp(),
                expiresAt: expiresAt,
                nuvioEmail: email,
                nuvioPassword: pwd,
                assignedTo: null
            });
            successCount++;
            bulkGenerateBtn.textContent = `Creating ${successCount}/${lines.length}...`;
        } catch (err) {
            console.error("Bulk error:", err);
            failCount++;
        }
    }
    
    bulkModal.classList.add('hidden');
    bulkGenerateBtn.disabled = false;
    bulkGenerateBtn.textContent = "Generate All";
    showToast(`✅ Bulk created: ${successCount} success, ${failCount} failed.`);
    loadData();
});

window.copyCredentials = (email, pwd) => {
    const text = `Email: ${email}\nPassword: ${pwd}`;
    copyToClipboard(text);
};

// ── Renew/Toggle/Delete Actions ─────────────────────────────────────────────
let pendingRenewId = null;
let pendingRenewCurrentExpiry = null;

window.openRenewModal = (id, name, currentMs) => {
    pendingRenewId = id;
    pendingRenewCurrentExpiry = currentMs;
    renewCustomerName.textContent = name;
    
    // Show current expiry
    const expiryDate = currentMs ? new Date(currentMs) : null;
    const displayEl = document.getElementById('renew-current-expiry-display');
    const remainingEl = document.getElementById('renew-days-remaining');
    
    if (expiryDate) {
        displayEl.textContent = expiryDate.toLocaleDateString('en-US', { year:'numeric', month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' });
        const diff = expiryDate.getTime() - Date.now();
        if (diff > 0) {
            const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
            remainingEl.textContent = `${days} days remaining`;
            remainingEl.style.color = '#10b981';
        } else {
            remainingEl.textContent = 'EXPIRED';
            remainingEl.style.color = '#ef4444';
        }
    } else {
        displayEl.textContent = 'No expiry set';
        remainingEl.textContent = '';
    }
    
    document.getElementById('renew-days-input').value = '7';
    renewModal.classList.remove('hidden');
};

// Add days button
document.getElementById('renew-add-btn').addEventListener('click', async () => {
    const days = parseInt(document.getElementById('renew-days-input').value, 10);
    if (isNaN(days) || days < 1) return showToast('❌ Invalid number of days.');
    
    let baseDate = pendingRenewCurrentExpiry ? new Date(pendingRenewCurrentExpiry) : new Date();
    if (baseDate.getTime() < Date.now()) baseDate = new Date();
    baseDate.setDate(baseDate.getDate() + days);
    
    try {
        await updateDoc(doc(db, 'customers', pendingRenewId), { expiresAt: baseDate, status: 'active' });
        showToast(`✅ Added ${days} days.`);
        renewModal.classList.add('hidden');
        loadData();
    } catch (e) {
        showToast('❌ Failed to add days.');
    }
});

// Remove days button
document.getElementById('renew-remove-btn').addEventListener('click', async () => {
    const days = parseInt(document.getElementById('renew-days-input').value, 10);
    if (isNaN(days) || days < 1) return showToast('❌ Invalid number of days.');
    
    let baseDate = pendingRenewCurrentExpiry ? new Date(pendingRenewCurrentExpiry) : new Date();
    baseDate.setDate(baseDate.getDate() - days);
    
    // Don't allow setting expiry before now
    if (baseDate.getTime() < Date.now()) {
        baseDate = new Date(); // Set to now (effectively expires immediately)
    }
    
    try {
        await updateDoc(doc(db, 'customers', pendingRenewId), { expiresAt: baseDate });
        showToast(`✅ Removed ${days} days.`);
        renewModal.classList.add('hidden');
        loadData();
    } catch (e) {
        showToast('❌ Failed to remove days.');
    }
});

// Quick set buttons (overwrite expiry to exactly N days from now)
document.querySelectorAll('.quick-set-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
        const days = parseInt(btn.dataset.days, 10);
        const newExpiry = new Date();
        newExpiry.setDate(newExpiry.getDate() + days);
        
        try {
            await updateDoc(doc(db, 'customers', pendingRenewId), { expiresAt: newExpiry, status: 'active' });
            showToast(`✅ Set to ${days} days from now.`);
            renewModal.classList.add('hidden');
            loadData();
        } catch (e) {
            showToast('❌ Failed to set expiry.');
        }
    });
});

window.toggleStatus = async (id, currentStatus) => {
    const newStatus = currentStatus === 'active' ? 'blocked' : 'active';
    if (!confirm(`Are you sure you want to ${newStatus === 'blocked' ? 'block' : 'unblock'} this token?`)) return;
    try {
        await updateDoc(doc(db, "customers", id), { status: newStatus });
        showToast(`✅ Token ${newStatus}.`);
        loadData();
    } catch (e) {
        console.error(e);
        showToast('❌ Failed to update status.');
    }
};

window.unassignToken = async (id) => {
    if (!confirm(`Are you sure you want to unassign this token?\n\nThis will make it available to be auto-assigned to the next customer.`)) return;
    try {
        await updateDoc(doc(db, "customers", id), { assignedTo: null });
        showToast(`✅ Token unassigned.`);
        loadData();
    } catch (e) {
        console.error(e);
        showToast('❌ Failed to unassign token.');
    }
};

window.deleteToken = async (id) => {
    if (!confirm(`Permanently delete token "${id}"?\n\nThis cannot be undone.`)) return;
    try {
        await deleteDoc(doc(db, "customers", id));
        showToast('🗑️ Token deleted.');
        loadData();
    } catch (e) {
        console.error(e);
        showToast('❌ Failed to delete token.');
    }
};

// ── Links Copy Modal Logic ──────────────────────────────────────────────────
const diagContainer = document.getElementById('diagnostic-console-container');
const diagConsole = document.getElementById('diagnostic-console');
const clearDiagBtn = document.getElementById('clear-diagnostics');

if (clearDiagBtn) {
    clearDiagBtn.addEventListener('click', () => {
        diagContainer.classList.add('hidden');
    });
}

function logDiag(msg, type = 'info') {
    const el = document.createElement('div');
    el.className = `log-${type}`;
    el.textContent = `> ${msg}`;
    diagConsole.appendChild(el);
    diagConsole.scrollTop = diagConsole.scrollHeight;
}

window.runVerifier = async (url, btnEl) => {
    diagContainer.classList.remove('hidden');
    diagConsole.innerHTML = '';
    logDiag(`Starting diagnostic for: ${url}`, 'info');

    if (btnEl) {
        btnEl.dataset.originalHtml = btnEl.innerHTML;
        btnEl.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
        btnEl.disabled = true;
    }

    let isSuccess = false;

    try {
        logDiag('Fetching manifest.json...', 'info');
        const start = Date.now();
        const res = await fetch(url);
        const ms = Date.now() - start;

        if (!res.ok) {
            logDiag(`HTTP Error: ${res.status} ${res.statusText}`, 'error');
            throw new Error('HTTP Error');
        }

        const manifest = await res.json();
        logDiag(`SUCCESS! Fetched in ${ms}ms`, 'info');
        logDiag(`Addon Name: ${manifest.name}`, 'info');
        logDiag(`Catalogs provided: ${manifest.catalogs ? manifest.catalogs.length : 0}`, 'info');

        if (manifest.id && manifest.id.includes('bundle')) {
            logDiag('\nMaster Bundle detected. Running stream stress test...', 'info');
            logDiag('Fetching streams for tt0111161 (The Shawshank Redemption)...', 'info');
            
            const streamUrl = url.replace('manifest.json', 'stream/movie/tt0111161.json');
            const sStart = Date.now();
            const sRes = await fetch(streamUrl);
            const sMs = Date.now() - sStart;

            if (!sRes.ok) {
                logDiag(`Stream Error: ${sRes.status} ${sRes.statusText}`, 'error');
                throw new Error('Stream Error');
            }

            const streamData = await sRes.json();
            const streamCount = streamData.streams ? streamData.streams.length : 0;
            logDiag(`SUCCESS! Fetched streams in ${sMs}ms`, 'info');
            logDiag(`Total streams aggregated: ${streamCount}`, 'info');
            
            if (streamCount === 0) {
                logDiag('WARNING: No streams returned. Are your global addons configured correctly?', 'warn');
            }
        }

        logDiag('\n✅ Diagnostic complete.', 'info');
        isSuccess = true;
    } catch (e) {
        logDiag(`Fetch failed: ${e.message}`, 'error');
        isSuccess = false;
    }

    if (btnEl) {
        btnEl.innerHTML = isSuccess ? '<i class="fas fa-check" style="color:var(--text-green);"></i>' : '<i class="fas fa-times" style="color:var(--text-red);"></i>';
        setTimeout(() => {
            btnEl.innerHTML = btnEl.dataset.originalHtml;
            btnEl.disabled = false;
        }, 2000);
    }
};
function copyToClipboard(text) {
    navigator.clipboard.writeText(text)
        .then(() => showToast('🔗 Link copied to clipboard!'))
        .catch(err => {
            console.error('Copy fail', err);
            // Fallback for insecure environments
            const input = document.createElement('input');
            input.value = text;
            document.body.appendChild(input);
            input.select();
            document.execCommand('copy');
            input.remove();
            showToast('🔗 Link copied to clipboard!');
        });
}

window.copyLink = (btnEl, id, customerName) => {
    const addons = ADDONS;
    // Use production URL so links work correctly even when admin is accessed from localhost
    const baseUrl = 'https://nuviostreamapi.vercel.app';

    // Set header info
    document.getElementById('links-customer-name').textContent = customerName;

    // Populate master bundle
    const masterUrl = `${baseUrl}/${id}/manifest.json`;
    const masterInput = document.getElementById('master-link-input');
    masterInput.value = masterUrl;
    
    const masterCopyBtn = document.querySelector('.copy-btn-action[data-input-id="master-link-input"]');
    if (masterCopyBtn) masterCopyBtn.onclick = () => copyToClipboard(masterUrl);
    
    const masterTestBtn = document.querySelector('.test-btn-action[data-input-id="master-link-input"]');
    if (masterTestBtn) masterTestBtn.onclick = function() { window.runVerifier(masterUrl, this); };

    // Populate individual links
    const container = document.getElementById('individual-links-container');
    container.innerHTML = '';

    if (addons.length === 0) {
        container.innerHTML = `<div class="no-addons-warning">No global addons configured yet. Open Global Settings to add them.</div>`;
    } else {
        addons.forEach(addon => {
            const routeName = addon.name.toLowerCase().replace(/[^a-z0-9]/g, '');
            if (routeName) {
                const addonUrl = `${baseUrl}/${id}/${routeName}/manifest.json`;

                const item = document.createElement('div');
                item.className = 'addon-link-item';

                const label = document.createElement('div');
                label.className = 'addon-link-label';
                label.textContent = addon.name;
                item.appendChild(label);

                const group = document.createElement('div');
                group.className = 'copy-input-group';

                const input = document.createElement('input');
                input.type = 'text';
                input.className = 'form-input link-preview-input';
                input.value = addonUrl;
                input.readOnly = true;
                group.appendChild(input);

                const testBtn = document.createElement('button');
                testBtn.className = 'btn btn-outline btn-sm';
                testBtn.textContent = 'Test';
                testBtn.onclick = function() { window.runVerifier(addonUrl, this); };
                group.appendChild(testBtn);

                const copyBtn = document.createElement('button');
                copyBtn.className = 'btn btn-glow btn-sm';
                copyBtn.textContent = 'Copy';
                copyBtn.onclick = () => copyToClipboard(addonUrl);
                group.appendChild(copyBtn);

                item.appendChild(group);
                container.appendChild(item);
            }
        });
    }
    
    // Toggle advanced individual links
    const toggleBtn = document.getElementById('toggle-individual-links');
    const wrapper = document.getElementById('individual-links-wrapper');
    if (toggleBtn && wrapper) {
        // Reset state when opening modal
        wrapper.classList.add('hidden');
        toggleBtn.textContent = 'Show Advanced Individual Links';
        
        // Remove old listeners to prevent stacking
        const newToggleBtn = toggleBtn.cloneNode(true);
        toggleBtn.parentNode.replaceChild(newToggleBtn, toggleBtn);
        
        newToggleBtn.addEventListener('click', () => {
            wrapper.classList.toggle('hidden');
            if (wrapper.classList.contains('hidden')) {
                newToggleBtn.textContent = 'Show Advanced Individual Links';
            } else {
                newToggleBtn.textContent = 'Hide Advanced Individual Links';
            }
        });
    }

    document.getElementById('links-modal').classList.remove('hidden');
};

// ── Expiry Helpers ──────────────────────────────────────────────────────────
function getExpiryInfo(expiresAt) {
    if (!expiresAt) return { text: 'No expiry', daysLabel: null, isExpired: false };

    let expDate;
    if (typeof expiresAt.toMillis === 'function') {
        expDate = new Date(expiresAt.toMillis());
    } else if (expiresAt instanceof Date) {
        expDate = expiresAt;
    } else if (expiresAt.seconds) {
        expDate = new Date(expiresAt.seconds * 1000);
    } else {
        expDate = new Date(expiresAt);
    }

    const dateStr = expDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const now = Date.now();
    const diff = expDate.getTime() - now;
    const days = diff / (1000 * 3600 * 24);

    if (days < 0) {
        return { text: dateStr, daysLabel: 'Expired', isExpired: true };
    }

    let daysLabel = days < 1 ? '< 1d left' : `${Math.ceil(days)}d left`;
    return { text: dateStr, daysLabel, isExpired: false };
}



// ── Load Data ───────────────────────────────────────────────────────────────
async function loadData() {
    spinner.style.display = 'block';
    noCustomers.classList.add('hidden');

    try {
        // Addons are hardcoded — no Firestore read needed for global settings

        // 2. Fetch customers
        const snapshot = await getDocs(customersRef);
        spinner.style.display = 'none';
        tbody.innerHTML = '';

        
        let totalCount = snapshot.size;
        let availableCount = 0;
        let assignedCount = 0;
        let blockedOrExpiredCount = 0;

        if (snapshot.empty) {
            noCustomers.classList.remove('hidden');
            statTotal.textContent   = 0;
            statAvailable.textContent  = 0;
            statAssigned.textContent = 0;
            statBlocked.textContent = 0;
            return;
        }

        noCustomers.classList.add('hidden');

        snapshot.forEach((docSnap) => {
            const data   = docSnap.data();
            const id     = docSnap.id;
            const name   = data.name   || 'Unnamed';
            const status = data.status || 'blocked';

            const notes  = data.notes || '';
            const assignedTo = data.assignedTo || null;
            const nuvioEmail = data.nuvioEmail || '';
            const nuvioPassword = data.nuvioPassword || '';
            
            const expiry = getExpiryInfo(data.expiresAt);
            const isBlocked  = status !== 'active';
            const isExpired  = expiry.isExpired;
            const isInactive = isBlocked || isExpired;

            // Calculate stats
            if (isInactive) {
                blockedOrExpiredCount++;
            } else if (assignedTo !== null) {
                assignedCount++;
            } else if (assignedTo === null && nuvioEmail !== '') {
                availableCount++;
            } else {
                // unconfigured
            }

            // Badges
            let statusBadge = isExpired ? `<span class="status-badge status-blocked" style="cursor:not-allowed;" data-tip="Cannot unblock expired token">Expired</span>` :
                              isBlocked ? `<span class="status-badge status-blocked" style="cursor:pointer;" data-tip="Click to Unblock" onclick="window.toggleStatus('${id}', '${status}')">Blocked</span>` :
                              `<span class="status-badge status-active" style="cursor:pointer;" data-tip="Click to Block" onclick="window.toggleStatus('${id}', '${status}')">Active</span>`;

            let assignedBadge;
            let unassignBtn = '';
            let credentialsBtn = '';
            
            if (assignedTo === null) {
                assignedBadge = `<span class="status-badge status-active" style="background: rgba(16, 185, 129, 0.15); color: #10b981; border: 1px solid #10b981;">🟢 Available</span>`;
            } else {
                assignedBadge = `<span class="status-badge" style="background: rgba(239, 68, 68, 0.15); color: #ef4444; border: 1px solid #ef4444;">🔴 Assigned: ${String(assignedTo).substring(0, 8)}</span>`;
                unassignBtn = `
                    <button class="btn-icon" data-tip="Unassign" onclick="window.unassignToken('${id}')">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="8.5" cy="7" r="4"></circle><line x1="23" y1="11" x2="17" y2="11"></line></svg>
                    </button>
                `;
                if (nuvioEmail && nuvioPassword) {
                    credentialsBtn = `
                        <button class="btn-icon" data-tip="Copy Credentials" onclick="window.copyCredentials('${nuvioEmail.replace(/'/g, "\'")}', '${nuvioPassword.replace(/'/g, "\'")}')">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                        </button>
                    `;
                }
            }

            const expiresMillis = data.expiresAt ? data.expiresAt.toMillis() : 0;
            const dataStr = encodeURIComponent(JSON.stringify(data));

            const tr = document.createElement('tr');
            tr.dataset.status = isInactive ? 'blocked' : 'active';
            tr.dataset.assigned = assignedTo === null ? 'null' : 'assigned';
            tr.dataset.configured = nuvioEmail === '' ? 'unconfigured' : 'configured';
            
            const safeNameHTML = String(name).replace(/[&<>'"]/g, tag => ({'&': '&amp;','<': '&lt;','>': '&gt;',"'": '&#39;','"': '&quot;'}[tag]));
            const safeNotesHTML = String(notes).replace(/[&<>'"]/g, tag => ({'&': '&amp;','<': '&lt;','>': '&gt;',"'": '&#39;','"': '&quot;'}[tag]));
            const safeNameJS = String(name).replace(/\\/g, '\\\\').replace(/'/g, "\\'");

            tr.innerHTML = `
                <td class="cell-customer" data-label="Customer Name">
                    <div class="td-content">
                        <div>${safeNameHTML}</div>
                        ${notes ? `<div style="font-size: 0.8rem; color: var(--text-muted); margin-top: 0.2rem; white-space: pre-wrap; word-break: break-word;">${safeNotesHTML}</div>` : ''}
                    </div>
                </td>
                <td data-label="Token"><span class="cell-token td-content">${id}</span></td>
                <td data-label="Nuvio Email" class="cell-email"><div class="td-content" style="word-break: break-all;">${nuvioEmail || '<span style="color:var(--text-muted)">— Not set —</span>'}</div></td>
                <td data-label="Nuvio Password"><div class="td-content" style="word-break: break-all;">${nuvioPassword || '—'}</div></td>
                <td class="cell-assigned" data-label="Assigned To"><div class="td-content">${assignedBadge}</div></td>
                <td data-label="Expires">
                    <div class="td-content">
                        <div>${expiry.text}</div>
                        ${expiry.daysLabel ? `<div style="font-size:0.8rem;color:var(--text-muted);">${expiry.daysLabel}</div>` : ''}
                    </div>
                </td>
                <td data-label="Status"><div class="td-content">${statusBadge}</div></td>
                <td data-label="Actions">
                    <div class="action-buttons">
                        ${credentialsBtn}
                        ${unassignBtn}
                        <button class="btn-icon" data-tip="Edit" onclick="window.openEditModal('${id}', '${dataStr}')">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                        </button>
                        <button class="btn-icon btn-copy" data-tip="Copy Link" onclick="window.copyLink(this, '${id}', '${safeNameJS.replace(/"/g, '&quot;')}')">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>
                        </button>
                        <button class="btn-icon" data-tip="Renew" onclick="window.openRenewModal('${id}', '${safeNameJS.replace(/"/g, '&quot;')}', ${expiresMillis})">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"></polyline><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path></svg>
                        </button>
                        <button class="btn-icon text-red" data-tip="Delete" onclick="window.deleteToken('${id}')">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                        </button>
                    </div>
                </td>
            `;

            tbody.appendChild(tr);
        });

        // Calculate stats from loaded data (ZERO extra Firestore reads)
        let total = 0, available = 0, assigned = 0, expired = 0;
        document.querySelectorAll('#customers-body tr').forEach(row => {
            total++;
            const assignedCell = row.querySelector('.cell-assigned');
            const statusCell = row.dataset.status;
            
            if (assignedCell && assignedCell.dataset.assigned === 'null') {
                available++;
            } else if (assignedCell && assignedCell.dataset.assigned === 'assigned') {
                assigned++;
            }
            
            if (statusCell === 'blocked') {
                expired++;
            } else {
                // Check if expired by date
                const expiryText = row.querySelector('[data-label="Expires"] div')?.textContent || '';
                if (expiryText.toLowerCase().includes('expired')) {
                    expired++;
                }
            }
        });

        document.getElementById('stat-total').textContent = total;
        document.getElementById('stat-available').textContent = available;
        document.getElementById('stat-assigned').textContent = assigned;
        document.getElementById('stat-expired').textContent = expired;
        
        
        // Trigger search filter again in case data changed while searching
        const e = new Event('input');
        document.getElementById('roster-search').dispatchEvent(e);
        
    } catch (err) {
        console.error(err);
        showToast('❌ Failed to load database.');
    }
}

// ── Roster Filtering & Search ────────────────────────────────────────────────
let currentFilter = 'all'; 

function applyFilters() {
    const searchTerm = document.getElementById('roster-search')?.value.toLowerCase() || '';
    const rows = document.querySelectorAll('#customers-body tr');
    let visibleCount = 0;
    
    rows.forEach(row => {
        const customerCell = row.querySelector('.cell-customer');
        const tokenCell = row.querySelector('.cell-token');
        const emailCell = row.querySelector('.cell-email');
        if (!customerCell || !tokenCell) return;

        const name = customerCell.textContent.toLowerCase();
        const id = tokenCell.textContent.toLowerCase();
        const email = emailCell ? emailCell.textContent.toLowerCase() : '';
        const assignedId = row.querySelector('.cell-assigned').textContent.toLowerCase();
        
        const matchesSearch = name.includes(searchTerm) || id.includes(searchTerm) || email.includes(searchTerm) || assignedId.includes(searchTerm);
        
        const status = row.dataset.status; // 'active' or 'blocked'
        const assignedStatus = row.dataset.assigned; // 'assigned' or 'null'
        const configuredStatus = row.dataset.configured; // 'configured' or 'unconfigured'
        const expiryText = row.querySelector('[data-label="Expires"] div')?.textContent || '';
        
        let matchesFilter = true;
        
        if (currentFilter === 'available') {
            if (assignedStatus !== 'null' || configuredStatus === 'unconfigured' || status === 'blocked') matchesFilter = false;
        } else if (currentFilter === 'assigned') {
            if (assignedStatus !== 'assigned') matchesFilter = false;
        } else if (currentFilter === 'unconfigured') {
            if (configuredStatus !== 'unconfigured') matchesFilter = false;
        } else if (currentFilter === 'blocked') {
            if (status !== 'blocked') matchesFilter = false;
        }
        
        // Add stat filter checks
        if (currentStatFilter === 'available' && assignedStatus !== 'null') matchesFilter = false;
        if (currentStatFilter === 'assigned' && assignedStatus !== 'assigned') matchesFilter = false;
        if (currentStatFilter === 'expired' && status !== 'blocked' && !expiryText.toLowerCase().includes('expired')) matchesFilter = false;
        
        if (matchesSearch && matchesFilter) {
            row.classList.remove('hidden');
            visibleCount++;
        } else {
            row.classList.add('hidden');
        }
    });
    
    if (visibleCount === 0 && rows.length > 0) {
        noCustomers.querySelector('p').textContent = "No matching customers found.";
        noCustomers.classList.remove('hidden');
    } else if (rows.length === 0) {
        noCustomers.querySelector('p').textContent = "No customers found. Create a token to get started!";
        noCustomers.classList.remove('hidden');
    } else {
        noCustomers.classList.add('hidden');
    }
}

// Bind filter buttons
document.querySelectorAll('.btn-filter').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.btn-filter').forEach(b => {
            b.classList.remove('active');
            b.classList.add('btn-outline');
        });
        btn.classList.add('active');
        btn.classList.remove('btn-outline');
        currentFilter = btn.dataset.filter;
        
        // Sync the stat card filter back to 'all' when a top filter is clicked
        currentStatFilter = 'all';
        document.querySelectorAll('.stat-card').forEach(c => c.classList.remove('active-filter'));
        const totalFilterEl = document.getElementById('filter-total');
        if (totalFilterEl) totalFilterEl.classList.add('active-filter');
        
        applyFilters();
    });
});

// Stat card click filters
let currentStatFilter = 'all';

function syncTopFilter() {
    currentFilter = 'all';
    document.querySelectorAll('.btn-filter').forEach(b => { 
        b.classList.remove('active'); 
        b.classList.add('btn-outline'); 
    });
    const allBtn = document.querySelector('.btn-filter[data-filter="all"]');
    if (allBtn) {
        allBtn.classList.add('active');
        allBtn.classList.remove('btn-outline');
    }
}

document.getElementById('filter-total').addEventListener('click', () => {
    currentStatFilter = 'all';
    document.querySelectorAll('.stat-card').forEach(c => c.classList.remove('active-filter'));
    document.getElementById('filter-total').classList.add('active-filter');
    syncTopFilter();
    applyFilters();
});

document.getElementById('filter-available').addEventListener('click', () => {
    currentStatFilter = 'available';
    document.querySelectorAll('.stat-card').forEach(c => c.classList.remove('active-filter'));
    document.getElementById('filter-available').classList.add('active-filter');
    syncTopFilter();
    applyFilters();
});

document.getElementById('filter-assigned').addEventListener('click', () => {
    currentStatFilter = 'assigned';
    document.querySelectorAll('.stat-card').forEach(c => c.classList.remove('active-filter'));
    document.getElementById('filter-assigned').classList.add('active-filter');
    syncTopFilter();
    applyFilters();
});

document.getElementById('filter-expired').addEventListener('click', () => {
    currentStatFilter = 'expired';
    document.querySelectorAll('.stat-card').forEach(c => c.classList.remove('active-filter'));
    document.getElementById('filter-expired').classList.add('active-filter');
    syncTopFilter();
    applyFilters();
});

document.getElementById('roster-search')?.addEventListener('input', applyFilters);

document.getElementById('refresh-data-btn')?.addEventListener('click', () => {
    loadData();
});

// ── Login Setup ─────────────────────────────────────────────────────────────
function enterDashboard() {
    loginOverlay.classList.remove('active');
    dashboard.classList.remove('hidden');
    loadData();
}

if (localStorage.getItem('nuvio_auth') === ADMIN_PASSWORD_HASH) {
    enterDashboard();
}

loginBtn.addEventListener('click', async () => {
    const inputHash = await hashStr(passwordInput.value);
    if (inputHash === ADMIN_PASSWORD_HASH) {
        localStorage.setItem('nuvio_auth', ADMIN_PASSWORD_HASH);
        enterDashboard();
    } else {
        loginError.textContent = "Incorrect password.";
        passwordInput.value = '';
    }
});

passwordInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') loginBtn.click();
});
window.openEditModal = openEditModal;
