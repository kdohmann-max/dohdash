// Barrel: db.ts is now a thin re-export of the domain modules under
// src/storage/. The one-client rule is unchanged — every domain file imports
// the single supabase client from ./client. Consumers keep importing from
// "../../storage/db" with zero churn.
export { supabase } from "./client";
export * from "./profiles";
export * from "./appAccess";
export * from "./admin";
export * from "./groups";
export * from "./notes";
export * from "./shares";
export * from "./comments";
export * from "./remote";
export * from "./tenants";
