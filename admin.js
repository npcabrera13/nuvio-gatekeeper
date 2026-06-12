import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
    getFirestore, collection, onSnapshot,
    doc, getDoc, setDoc, updateDoc, deleteDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// ── Configuration ──────────────────────────────────────────────────────────
const ADMIN_PASSWORD = "nuvio";

const firebaseConfig = {
    apiKey: "AIzaSyC4OXdfVs_mXPinhmpAt2su8WKZhUDXWoQ",
    authDomain: "multiaddon.firebaseapp.com",
    projectId: "multiaddon",
    storageBucket: "multiaddon.firebasestorage.app",
    messagingSenderId: "963978475190",
    appId: "1:963978475190:web:6796687180b021e049d817"
};

const app = initializeApp(firebaseConfig);
const db  = getFirestore(app);
const customersRef = collection(db, "customers");
const globalSettingsRef = doc(db, 'settings', 'global');

// ── DOM Refs ────────────────────────────────────────────────────────────────
const loginOverlay  = document.getElementById('login-overlay');
const passwordInput = document.getElementById('password-input');
const loginBtn      = document.getElementById('login-btn');
const loginError    = document.getElementById('login-error');
const dashboard     = document.getElementById('dashboard');
const tbody         = document.getElementById('customers-body');
const spinner       = document.getElementById('loading-spinner');
const noCustomers   = document.getElementById('no-customers');
const statTotal     = document.getElementById('total-users');
const statActive    = document.getElementById('active-users');
const statBlocked   = document.getElementById('blocked-users');

const tokenModal    = document.getElementById('token-modal');
const modalTitle    = document.getElementById('modal-title');
const editTokenId   = document.getElementById('edit-token-id');
const modalName     = document.getElementById('modal-name');
const modalTokenKey = document.getElementById('modal-token-key');
const tokenKeyGroup = document.getElementById('token-key-group');
const modalDays     = document.getElementById('modal-days');
const daysGroup     = document.getElementById('days-group');
const saveTokenBtn  = document.getElementById('save-token-btn');

const globalSettingsModal = document.getElementById('global-settings-modal');
const globalAddonList = document.getElementById('global-addon-list');
const addGlobalAddonBtn = document.getElementById('add-global-addon-btn');
const saveGlobalSettingsBtn = document.getElementById('save-global-settings-btn');
const addonTemplate = document.getElementById('addon-template');

const renewModal    = document.getElementById('renew-modal');
const renewCustomerName = document.getElementById('renew-customer-name');
const renewDays     = document.getElementById('renew-days');
const confirmRenewBtn = document.getElementById('confirm-renew-btn');

const toastEl       = document.getElementById('toast');

let globalAddonsCache = [];
let globalSupportUrlCache = '';

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

document.getElementById('open-create-modal').addEventListener('click', () => {
    modalTitle.textContent = "Create New Token";
    editTokenId.value = '';
    modalName.value = '';
    modalDays.value = '30';
    modalTokenKey.value = '';
    tokenKeyGroup.classList.add('hidden');
    daysGroup.classList.remove('hidden');
    tokenModal.classList.remove('hidden');
});

function openEditModal(id, dataStr) {
    const data = JSON.parse(decodeURIComponent(dataStr));
    modalTitle.textContent = "Edit Token";
    editTokenId.value = id;
    modalName.value = data.name || '';
    modalTokenKey.value = id;
    tokenKeyGroup.classList.remove('hidden');
    daysGroup.classList.add('hidden'); // Editing days is done via Renew modal
    tokenModal.classList.remove('hidden');
}

// ── Global Settings Handlers ────────────────────────────────────────────────
const globalAddonSearch = document.getElementById('global-addon-search');
const globalAddonCount = document.getElementById('global-addon-count');

function updateGlobalAddonCount() {
    const items = document.querySelectorAll('#global-addon-list .addon-item');
    if (globalAddonCount) globalAddonCount.textContent = `${items.length} Addon${items.length === 1 ? '' : 's'}`;
}

globalAddonSearch.addEventListener('input', function(e) {
    const term = e.target.value.toLowerCase();
    const items = document.querySelectorAll('#global-addon-list .addon-item');
    items.forEach(item => {
        const text = item.querySelector('.addon-name').value.toLowerCase() + " " + item.querySelector('.addon-url').value.toLowerCase();
        item.style.display = text.includes(term) ? 'flex' : 'none';
    });
});

document.getElementById('open-global-settings-modal').addEventListener('click', () => {
    globalAddonList.innerHTML = '';
    globalAddonSearch.value = '';
    document.getElementById('global-support-url').value = globalSupportUrlCache || '';
    
    if (globalAddonsCache.length === 0) {
        addAddonRow();
    } else {
        globalAddonsCache.forEach(a => addAddonRow(a.name, a.url));
    }
    updateGlobalAddonCount();
    globalSettingsModal.classList.remove('hidden');
});

addGlobalAddonBtn.addEventListener('click', () => addAddonRow('', '', true));

function addAddonRow(name = '', url = '', prepend = false) {
    const clone = addonTemplate.content.cloneNode(true);
    const row = clone.querySelector('.addon-item');
    row.querySelector('.addon-name').value = name;
    row.querySelector('.addon-url').value = url;
    
    row.querySelector('.remove-addon').addEventListener('click', () => {
        row.remove();
        updateGlobalAddonCount();
    });

    row.querySelector('.move-up').addEventListener('click', () => {
        if (row.previousElementSibling) {
            row.parentNode.insertBefore(row, row.previousElementSibling);
        }
    });

    row.querySelector('.move-down').addEventListener('click', () => {
        if (row.nextElementSibling) {
            row.parentNode.insertBefore(row.nextElementSibling, row);
        }
    });
    
    if (prepend) {
        globalAddonList.prepend(row);
    } else {
        globalAddonList.appendChild(row);
    }
    updateGlobalAddonCount();
}

function getAddonsFromForm() {
    const addons = [];
    document.querySelectorAll('.addon-item').forEach(row => {
        const name = row.querySelector('.addon-name').value.trim();
        let url = row.querySelector('.addon-url').value.trim();
        
        if (url) {
            // Auto-correct common URL mistakes
            if (url.startsWith('stremio://')) {
                url = 'https://' + url.slice(10);
            }
            if (!url.endsWith('manifest.json')) {
                if (url.endsWith('/')) {
                    url = url.slice(0, -1);
                }
                url = url + '/manifest.json';
            }
            // Update the input field visually so the user sees the correction
            row.querySelector('.addon-url').value = url;
            
            addons.push({ name: name || 'Addon', url });
        }
    });
    return addons;
}

saveGlobalSettingsBtn.addEventListener('click', async () => {
    const addons = getAddonsFromForm();
    const supportUrl = document.getElementById('global-support-url').value.trim();
    saveGlobalSettingsBtn.disabled = true;
    saveGlobalSettingsBtn.textContent = "Saving...";

    try {
        await setDoc(globalSettingsRef, { addons, supportUrl }, { merge: true });
        showToast('✅ Addons saved. Synchronizing Master Bundle...');
        
        try {
            const syncRes = await fetch('/api/sync', { method: 'POST' });
            if (syncRes.ok) {
                showToast('✅ Master Bundle synchronized successfully.');
            } else {
                showToast('⚠️ Addons saved, but manifest sync failed.');
            }
        } catch (err) {
            showToast('⚠️ Addons saved, but manifest sync failed.');
        }

        globalSettingsModal.classList.add('hidden');
    } catch (e) {
        console.error(e);
        showToast('❌ Failed to save settings.');
    }
    
    saveGlobalSettingsBtn.disabled = false;
    saveGlobalSettingsBtn.textContent = "Save Settings";
});

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
                expiresAt: expiresAt
            });
            showToast('✅ Token generated successfully.');
            
            // Auto copy bundle link immediately!
            copyToClipboard(`${window.location.origin}/${randomId}/manifest.json`);
            
        } else {
            // Edit
            const oldId = editTokenId.value;
            const newTokenId = modalTokenKey.value.trim();
            if (!newTokenId) throw new Error("Token ID cannot be empty");

            const updates = {
                name: nameVal
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
    } catch (e) {
        console.error(e);
        showToast('❌ ' + e.message);
    }
    
    saveTokenBtn.disabled = false;
    saveTokenBtn.textContent = isEdit ? "Save Changes" : "Generate Token";
});

// ── Renew/Toggle/Delete Actions ─────────────────────────────────────────────
let pendingRenewId = null;
let pendingRenewCurrentExpiry = null;

window.openRenewModal = (id, name, currentMs) => {
    pendingRenewId = id;
    pendingRenewCurrentExpiry = currentMs;
    renewCustomerName.textContent = name;
    renewDays.value = '30';
    renewModal.classList.remove('hidden');
};

confirmRenewBtn.addEventListener('click', async () => {
    const days = parseInt(renewDays.value, 10);
    if (isNaN(days) || days < 1) return alert("Invalid days");
    
    confirmRenewBtn.disabled = true;
    
    try {
        let baseDate = pendingRenewCurrentExpiry ? new Date(pendingRenewCurrentExpiry) : new Date();
        if (baseDate.getTime() < Date.now()) baseDate = new Date(); // If expired, start from today
        
        baseDate.setDate(baseDate.getDate() + days);
        
        await updateDoc(doc(db, 'customers', pendingRenewId), {
            expiresAt: baseDate,
            status: 'active'
        });
        showToast(`✅ Added ${days} days.`);
        renewModal.classList.add('hidden');
    } catch (e) {
        console.error(e);
        showToast('❌ Failed to renew.');
    }
    
    confirmRenewBtn.disabled = false;
});

window.toggleStatus = async (id, currentStatus) => {
    const newStatus = currentStatus === 'active' ? 'blocked' : 'active';
    if (!confirm(`Are you sure you want to ${newStatus === 'blocked' ? 'block' : 'unblock'} this token?`)) return;
    try {
        await updateDoc(doc(db, "customers", id), { status: newStatus });
        showToast(`✅ Token ${newStatus}.`);
    } catch (e) {
        console.error(e);
        showToast('❌ Failed to update status.');
    }
};

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
    const addons = globalAddonsCache;
    const baseUrl = window.location.origin;

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

// ── Load Data (Real-time) ───────────────────────────────────────────────────
function loadData() {
    // Listen to global settings
    onSnapshot(globalSettingsRef, (snap) => {
        if (snap.exists()) {
            globalAddonsCache = snap.data().addons || [];
            globalSupportUrlCache = snap.data().supportUrl || '';
        } else {
            globalAddonsCache = [];
            globalSupportUrlCache = '';
        }
    });

    spinner.style.display = 'block';
    noCustomers.classList.add('hidden');

    onSnapshot(customersRef, (snapshot) => {
        spinner.style.display = 'none';
        tbody.innerHTML = '';

        let activeCount = 0, blockedCount = 0;

        if (snapshot.empty) {
            noCustomers.classList.remove('hidden');
            statTotal.textContent   = 0;
            statActive.textContent  = 0;
            statBlocked.textContent = 0;
            return;
        }

        noCustomers.classList.add('hidden');

        snapshot.forEach((docSnap) => {
            const data   = docSnap.data();
            const id     = docSnap.id;
            const name   = data.name   || 'Unnamed';
            const status = data.status || 'blocked';

            const expiry = getExpiryInfo(data.expiresAt);
            const isBlocked  = status !== 'active';
            const isExpired  = expiry.isExpired;
            const isInactive = isBlocked || isExpired;

            if (!isInactive) activeCount++;
            else blockedCount++;

            // Badges
            let statusBadge = isExpired ? `<span class="status-badge status-blocked" style="cursor:not-allowed;" data-tip="Cannot unblock expired token">Expired</span>` :
                              isBlocked ? `<span class="status-badge status-blocked" style="cursor:pointer;" data-tip="Click to Unblock" onclick="window.toggleStatus('${id}', '${status}')">Blocked</span>` :
                              `<span class="status-badge status-active" style="cursor:pointer;" data-tip="Click to Block" onclick="window.toggleStatus('${id}', '${status}')">Active</span>`;

            const expiresMillis = data.expiresAt ? data.expiresAt.toMillis() : 0;
            const dataStr = encodeURIComponent(JSON.stringify(data));

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td class="cell-customer">${name}</td>
                <td><span class="cell-token">${id}</span></td>
                <td>
                    <div>${expiry.text}</div>
                    ${expiry.daysLabel ? `<div style="font-size:0.8rem;color:var(--text-muted);">${expiry.daysLabel}</div>` : ''}
                </td>
                <td>${statusBadge}</td>
                <td>
                    <div class="action-buttons">
                        <button class="btn-icon btn-copy" data-tip="Copy Link" onclick="window.copyLink(this, '${id}', '${name.replace(/'/g, "\\'")}')">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                        </button>
                        <button class="btn-icon" data-tip="Edit" onclick="window.openEditModal('${id}', '${dataStr}')">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                        </button>
                        <button class="btn-icon" data-tip="Renew" onclick="window.openRenewModal('${id}', '${name}', ${expiresMillis})">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"></polyline><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path></svg>
                        </button>
                        <button class="btn-icon" data-tip="${isBlocked ? 'Unblock' : 'Block'}" onclick="window.toggleStatus('${id}', '${status}')">
                            ${isBlocked 
                                ? `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 9.9-1"></path></svg>`
                                : `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"></line></svg>`
                            }
                        </button>
                        <button class="btn-icon text-red" data-tip="Delete" onclick="window.deleteToken('${id}')">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                        </button>
                    </div>
                </td>
            `;

            tbody.appendChild(tr);
        });

        statTotal.textContent   = snapshot.size;
        statActive.textContent  = activeCount;
        statBlocked.textContent = blockedCount;
        
        // Trigger search filter again in case data changed while searching
        const e = new Event('input');
        document.getElementById('roster-search').dispatchEvent(e);
        
    }, (err) => {
        console.error(err);
        showToast('❌ Failed to load database.');
    });
}

// ── Roster Search ───────────────────────────────────────────────────────────
document.getElementById('roster-search').addEventListener('input', function(e) {
    const term = e.target.value.toLowerCase();
    const rows = document.querySelectorAll('#customers-tbody tr');
    rows.forEach(row => {
        const name = row.querySelector('.cell-customer').textContent.toLowerCase();
        const id = row.querySelector('.cell-token').textContent.toLowerCase();
        if (name.includes(term) || id.includes(term)) {
            row.style.display = '';
        } else {
            row.style.display = 'none';
        }
    });
});

// ── Login Setup ─────────────────────────────────────────────────────────────
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
        loginError.textContent = "Incorrect password.";
        passwordInput.value = '';
    }
});

passwordInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') loginBtn.click();
});
window.openEditModal = openEditModal;
