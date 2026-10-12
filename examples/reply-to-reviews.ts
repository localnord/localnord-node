// Drafts AI replies to new Google reviews and, with --publish, sends the positive ones.
//
//   LOCALNORD_API_KEY=lnk_… npx tsx examples/reply-to-reviews.ts            # drafts only
//   LOCALNORD_API_KEY=lnk_… npx tsx examples/reply-to-reviews.ts --publish  # drafts + publish 4★ and 5★
//
// Each run drafts the reviews that have neither a reply nor a draft yet. Drafts are
// saved in Localnord (Reviews page): the ones this script does not publish (negative,
// flagged, or every draft without --publish) wait there for a human, and later runs
// leave them alone.

import { Localnord, LocalnordError } from "localnord";

const PUBLISH = process.argv.includes("--publish");
const MIN_RATING_TO_AUTOPUBLISH = 4;

const localnord = new Localnord();

for (const listing of await localnord.listings.list()) {
  if (listing.paused) continue;

  const { drafts, remaining_unreplied } = await localnord.reviews.generateReplies({
    listing_id: listing.id,
    reply_state: "unreplied",
    max_reviews: 10,
    tone: "warm",
  });
  console.log(`\n${listing.name}: ${drafts.length} draft(s), ${remaining_unreplied} still unreplied`);

  for (const draft of drafts) {
    const safe = draft.rating >= MIN_RATING_TO_AUTOPUBLISH && draft.validation_warnings.length === 0;
    console.log(`  ${"★".repeat(draft.rating)} ${safe ? "auto" : "human"} → ${draft.replyDraft.slice(0, 80)}…`);
    if (!PUBLISH || !safe) continue;

    try {
      // Same key on a re-run: the reply is never sent twice.
      await localnord.reviews.reply(draft.reviewId, draft.replyDraft, { idempotencyKey: `reply-${draft.reviewId}` });
    } catch (error) {
      if (error instanceof LocalnordError && error.status === 409) continue; // already replied meanwhile
      throw error;
    }
  }
}

if (!PUBLISH) console.log("\nDrafts saved in Localnord (Reviews page), ready to check and send. With --publish, future runs also send the 4★ and 5★ ones.");
