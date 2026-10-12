// Writes a Google post with AI and creates it on a listing.
//
//   LOCALNORD_API_KEY=lnk_… npx tsx examples/publish-post.ts <listing-id> ["Subject"]            # draft
//   LOCALNORD_API_KEY=lnk_… npx tsx examples/publish-post.ts <listing-id> ["Subject"] --publish  # live
//
// Without a subject, Localnord suggests one from the listing (season, services…).

import { randomUUID } from "node:crypto";
import { Localnord } from "localnord";

const [listingId, subjectArg] = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
const PUBLISH = process.argv.includes("--publish");
if (!listingId) {
  console.error("Usage: publish-post.ts <listing-id> [subject] [--publish]");
  process.exit(1);
}

const localnord = new Localnord();

let subject = subjectArg;
if (!subject) {
  const ideas = await localnord.publications.generateSubjects({ listing_id: listingId, count: 3, mix: { news: 3 } });
  const idea = ideas.find((candidate) => !candidate.needs_validation);
  if (!idea) throw new Error("Every suggested subject needs a fact from you: pass a subject instead.");
  subject = idea.subject;
}

const { texts, needs_validation } = await localnord.publications.generateText({ listing_id: listingId, subject, tone: "warm" });
const text = texts[0]?.text;
if (!text) throw new Error(`Localnord needs more information to write this post: ${needs_validation}`);

const post = await localnord.publications.create(
  { listing_id: listingId, subject, text, post_type: "news", status: PUBLISH ? "scheduled" : "draft" },
  // One key per run: a network retry inside this run never creates a second post.
  { idempotencyKey: randomUUID() },
);

console.log(`${subject}\n\n${text}\n`);
console.log(PUBLISH ? `Scheduled: live on Google within a minute (id ${post.id}).` : `Saved as a draft in Localnord (id ${post.id}). Add --publish to post it.`);
