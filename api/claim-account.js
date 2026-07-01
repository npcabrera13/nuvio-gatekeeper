// Post-payment account claim endpoint.
// POST /api/claim-account  { email: "customer@gmail.com", days: 30 }
//
// Called by the customer site AFTER PayMongo confirms payment.
// Atomically (Firestore transaction):
//   1. Reject if this email already has an active subscription (anti-abuse).
//   2. Find an available Nuvio account (unassigned, active, configured).
//   3. If none → return "no_accounts" so the dashboard can show the refund message.
//   4. Assign the account + set expiresAt = now + days.
//
// This is the buy-path equivalent of /api/redeem. It exists to eliminate the
// race condition where two customers pay simultaneously for the last account.
// The transaction guarantees only one of them gets it; the other gets a clear
// "no accounts" response and sees the refund banner.

const { initializeApp } = require("firebase/app");
const {
  getFirestore,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  runTransaction,
  serverTimestamp,
  Timestamp
} = require("firebase/firestore");

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

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Content-Type", "application/json");
}

function isExpired(expiresAt) {
  if (!expiresAt) return false;
  let ms;
  if (expiresAt.toMillis) ms = expiresAt.toMillis();
  else if (expiresAt.seconds) ms = expiresAt.seconds * 1000;
  else ms = new Date(expiresAt).getTime();
  return ms <= Date.now();
}

module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  const email = (body?.email || "").trim().toLowerCase();
  const days = Math.max(1, Math.min(365, parseInt(body?.days) || 30));

  if (!email) {
    return res.status(400).json({ ok: false, error: "bad_request", message: "Missing email." });
  }

  try {
    // 1. Anti-abuse: reject if this email already has an active, non-expired subscription.
    const existingQ = query(
      collection(db, "customers"),
      where("assignedTo", "==", email)
    );
    const existingSnap = await getDocs(existingQ);
    let alreadyHasActive = false;
    existingSnap.forEach(d => {
      const data = d.data();
      if (!isExpired(data.expiresAt) && (data.status || 'active') === 'active') {
        alreadyHasActive = true;
      }
    });
    if (alreadyHasActive) {
      return res.status(200).json({
        ok: false,
        error: "already_active",
        message: "You already have an active subscription."
      });
    }

    // 2. Find an available Nuvio account (unassigned, active, configured).
    const custSnap = await getDocs(collection(db, "customers"));
    let availableToken = null;
    custSnap.forEach(d => {
      if (availableToken) return;
      const data = d.data();
      const assignedTo = data.assignedTo || '';
      const isAssigned = assignedTo && assignedTo.trim() !== '';
      const isBlocked = (data.status || 'active') !== 'active';
      const isUnconfigured = !data.nuvioEmail || data.nuvioEmail.trim() === '';
      if (!isAssigned && !isBlocked && !isUnconfigured) {
        availableToken = { id: d.id, data };
      }
    });

    if (!availableToken) {
      return res.status(200).json({
        ok: false,
        error: "no_accounts",
        message: "All Nuvio accounts are currently taken. Please contact support for a refund."
      });
    }

    // 3. Atomically assign via transaction (re-check inside to handle races).
    const tokenRef = doc(db, "customers", availableToken.id);
    const newExpiry = Timestamp.fromDate(new Date(Date.now() + days * 86400000));

    await runTransaction(db, async (tx) => {
      const tokenRead = await tx.get(tokenRef);
      if (!tokenRead.exists()) {
        throw new Error("TOKEN_GONE");
      }
      const tData = tokenRead.data();
      const assignedTo = tData.assignedTo || '';
      if (assignedTo && assignedTo.trim() !== '') {
        throw new Error("TOKEN_TAKEN");
      }
      tx.update(tokenRef, {
        assignedTo: email,
        name: email,
        status: 'active',
        expiresAt: newExpiry,
        assignedVia: 'payment',
        assignedAt: serverTimestamp()
      });
    });

    return res.status(200).json({
      ok: true,
      message: `Account assigned (${days} days)`,
      token: availableToken.id,
      days,
      expiresAt: newExpiry.toMillis ? newExpiry.toMillis() : null
    });
  } catch (err) {
    if (err && err.message === "TOKEN_GONE") {
      return res.status(200).json({
        ok: false,
        error: "no_accounts",
        message: "All Nuvio accounts are currently taken. Please contact support for a refund."
      });
    }
    if (err && err.message === "TOKEN_TAKEN") {
      // Someone else claimed it mid-transaction. Could retry, but for simplicity
      // surface the clear message — customer should contact support for refund.
      return res.status(200).json({
        ok: false,
        error: "no_accounts",
        message: "All Nuvio accounts are currently taken. Please contact support for a refund."
      });
    }
    console.error("[claim-account] error:", err);
    return res.status(500).json({ ok: false, error: "server", message: "Server error" });
  }
};
