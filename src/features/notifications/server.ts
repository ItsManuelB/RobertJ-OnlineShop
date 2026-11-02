import "server-only";

// Server-only entry point of the notifications feature. Kept apart from `index.ts`
// (which exports client components) so a client bundle can never pull these in.
export { sendAdminReturnDigest } from "./lib/admin-digest-sweep";
export { sendDueOrderEmails, sendOrderEmailsFor } from "./lib/order-email-sweep";
export { sendDueReturnEmails } from "./lib/return-email-sweep";
