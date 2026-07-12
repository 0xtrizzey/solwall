// esbuild `inject` shim — makes the `Buffer` global available to
// @solana/web3.js and friends in browser/service-worker contexts.
import { Buffer } from "buffer";
export { Buffer };
if (typeof globalThis.Buffer === "undefined") globalThis.Buffer = Buffer;
