import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

// Expects GOOGLE_APPLICATION_CREDENTIALS env var to point to your service account JSON
initializeApp({ credential: cert(process.env.GOOGLE_APPLICATION_CREDENTIALS) });

const db = getFirestore();

function autoCategories(contact) {
  const cats = new Set();
  const name = (contact.name || "").toLowerCase();
  const hasPhone = !!(contact.phone || "").trim();
  const hasX = !!(contact.x || "").trim();
  const hasBsky = !!(contact.bsky || "").trim();
  const hasRentmasseur = !!(contact.rentmasseur || "").trim();
  const nameHasRmass = name.includes("rmass");

  if (hasRentmasseur || nameHasRmass || (hasPhone && !hasX && !hasBsky)) cats.add("Massage");
  if (!!(contact.meetfighters || "").trim()) cats.add("Wrestling");
  if (hasX || hasBsky) cats.add("Collabs");

  return [...cats];
}

async function run() {
  const usersSnap = await db.collection("users").get();
  let total = 0;
  let updated = 0;

  for (const userDoc of usersSnap.docs) {
    const uid = userDoc.id;
    const contactsSnap = await db.collection("users").doc(uid).collection("contacts").get();

    for (const contactDoc of contactsSnap.docs) {
      total++;
      const data = contactDoc.data();
      const existing = data.categories;
      const needsUpdate = !existing || !Array.isArray(existing) || existing.length === 0;

      if (needsUpdate) {
        const categories = autoCategories(data);
        await db.collection("users").doc(uid).collection("contacts").doc(contactDoc.id).update({ categories });
        console.log(`  ✓ ${data.name || "Unnamed"} (${data.city || "?"}) → [${categories.join(", ") || "none"}]`);
        updated++;
      } else {
        console.log(`  — ${data.name || "Unnamed"} (${data.city || "?"}) already has: [${existing.join(", ")}]`);
      }
    }
  }

  console.log(`\nDone. ${updated}/${total} contacts updated.`);
  process.exit(0);
}

run().catch(e => { console.error(e); process.exit(1); });
