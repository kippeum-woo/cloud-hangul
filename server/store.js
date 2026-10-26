// Node.js persistence adapter. Cloudflare imports the shared core directly.
import { createStore as createCore } from "./core/store.js";
import { persistent } from "./persistence.js";
export * from "./core/store.js";
export function createStore(options = {}) { return persistent(createCore, "messages.json", options); }
