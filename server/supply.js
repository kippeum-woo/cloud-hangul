// Node.js persistence adapter. Cloudflare imports the shared core directly.
import { createSupply as createCore } from "./core/supply.js";
import { persistent } from "./persistence.js";
export * from "./core/supply.js";
export function createSupply(options = {}) { return persistent(createCore, "supply.json", options); }
