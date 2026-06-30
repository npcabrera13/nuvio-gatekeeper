// Promo code redemption endpoint.
// POST /api/redeem  { code: "NUVIO-XXXXXX", email: "customer@gmail.com" }
//
// Flow:
//   1. Validate code + email.
//   2. Look up promoCodes/{code} in Firestore. If missing → "invalid".
//   3. Find an available Nuvio account (customers/{token} where assignedTo is empty,
//      status active, not expired, has nuvioEmail). If none → "no accounts".
//   4. Atomically:
//        - assign the customer email to that token
//        - set expiresAt = now + promo.days
//        - delete the promo code (single-use)
//   5. Return the assigned token id + expiry so the customer site can redirect
//      to the dashboard.
//
// This endpoint is server-side only (Vercel function). Firestore Admin SDK is
// not available on the hobby free tier without service-account creds, so we use
// the same client SDK the rest of the project uses. The atomicity guarantee
// relies on Firestore transactions.

const { initializeApp } = require("firebase/app");
const {
  getFirestore,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  setDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  Timestamp,
  runTransaction
} = require("firebase/firestore");

const firebaseConfig = {
  apiKey: "AIzaSyC4OXdfVs_mXPinhmpAt2su8WKZhUDXWoQ",
  authDomain: "multiaddon.firebaseapp.com",
  projectId: "multiaddon",
  storageBucket: "multiaddon.firebasestorage.app",
  messagingSenderId: "963978475190",
  appId: "1:963978475190:web:6796687180b021e049d817"
};

// Reuse a single app instance across warm invocations.
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
  const code = (body?.code || "").trim().toUpperCase();
  const email = (body?.email || "").trim().toLowerCase();

  if (!code || !email) {
    return res.status(400).json({ ok: false, error: "Missing code or email" });
  }

  try {
    // 1. Look up the promo code.
    const promoRef = doc(db, "promoCodes", code);
    const promoSnap = await getDoc(promoRef);
    if (!promoSnap.exists()) {
      return res.status(200).json({ ok: false, error: "invalid", message: "Promo code is invalid" });
    }
    const promo = promoSnap.data();
    const days = Math.max(1, Math.min(365, parseInt(promo.days) || 7));

    // 2. Reject if this customer already has an assigned, non-expired token.
    //    Prevents trial abuse (one trial per email).
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

    // 3. Find an available Nuvio account (unassigned, active, not expired, configured).
    const custSnap = await getDocs(collection(db, "customers"));
    let availableToken = null;
    custSnap.forEach(d => {
      if (availableToken) return;
      const data = d.data();
      const assignedTo = data.assignedTo || '';
      const isAssigned = assignedTo && assignedTo.trim() !== '';
      const isBlocked = (data.status || 'active') !== 'active';
      const expired = isExpired(data.expiresAt);
      const isUnconfigured = !data.nuvioEmail || data.nuvioEmail.trim() === '';
      if (!isAssigned && !isBlocked && !expired && !isUnconfigured) {
        availableToken = { id: d.id, data };
      }
    });

    if (!availableToken) {
      return res.status(200).json({
        ok: false,
        error: "no_accounts",
        message: "All Nuvio accounts are currently taken. Please check back later."
      });
    }

    // 4. Atomically assign + set expiry + delete promo code.
    const tokenRef = doc(db, "customers", availableToken.id);
    const newExpiry = Timestamp.fromDate(new Date(Date.now() + days * 86400000));

    await runTransaction(db, async (tx) => {
      // Re-read both inside the transaction to ensure consistency.
      const promoRead = await tx.get(promoRef);
      const tokenRead = await tx.get(tokenRef);

      if (!promoRead.exists()) {
        throw new Error("PROMO_GONE"); // someone else just redeemed it
      }
      const tData = tokenRead.data();
      const assignedTo = tData.assignedTo || '';
      if (assignedTo && assignedTo.trim() !== '') {
        throw new Error("TOKEN_TAKEN"); // someone else just took this account
      }

      tx.update(tokenRef, {
        assignedTo: email,
        name: email,
        status: 'active',
        expiresAt: newExpiry,
        assignedVia: 'promo_code',
        assignedAt: serverTimestamp()
      });
      tx.delete(promoRef);
    });

    return res.status(200).json({
      ok: true,
      message: `Promo code redeemed (${days} days)`,
      token: availableToken.id,
      days,
      expiresAt: newExpiry.toMillis ? newExpiry.toMillis() : null
    });
  } catch (err) {
    // Handle transaction race conditions gracefully.
    if (err && err.message === "PROMO_GONE") {
      return res.status(200).json({
        ok: false,
        error: "invalid",
        message: "Promo code was just redeemed. Please try another code."
      });
    }
    if (err && err.message === "TOKEN_TAKEN") {
      // Loop would be ideal, but for v1 surface a clear message.
      return res.status(200).json({
        ok: false,
        error: "no_accounts",
        message: "All Nuvio accounts are currently taken. Please check back later."
      });
    }
    console.error("[redeem] error:", err);
    return res.status(500).json({ ok: false, error: "server", message: "Server error" });
  }
};
