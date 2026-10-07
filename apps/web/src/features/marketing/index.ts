// Shared API of the marketing feature. Screens are imported by route files directly from ./screens/*:
// re-exporting them here would make every route bundle every screen's client components.
export { pageMetadata } from "./metadata";
export { contactSchema, type ContactInput } from "./contact/schemas";
