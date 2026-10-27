import "@testing-library/jest-dom/vitest";
import { Blob as NodeBlob } from "node:buffer";

// Vitest's jsdom environment always overrides `globalThis.Blob` with jsdom's
// own Blob implementation, which never implemented `.text()`/`.arrayBuffer()`/
// `.stream()` (it only has `slice`, `size`, `type`). On Node 24 (unlike
// Node 22), the built-in `Response.prototype.blob()` resolves its `Blob`
// constructor dynamically from `globalThis` at call time, so blobs returned
// from a real `Response` end up jsdom-shaped and missing those methods.
// Restoring the real Node `Blob` here (independent of the global, via
// `node:buffer`) keeps `response.blob()` usable the same way on every
// supported Node version. See #361.
globalThis.Blob = NodeBlob as unknown as typeof Blob;

// Normalize default number and compact currency formatting to en-US across all host locales.
const OrigNumberFormat = Intl.NumberFormat;
// @ts-ignore
Intl.NumberFormat = function (locales = "en-US", options?: Intl.NumberFormatOptions) {
  return new OrigNumberFormat(locales || "en-US", options);
} as unknown as typeof Intl.NumberFormat;
Intl.NumberFormat.prototype = OrigNumberFormat.prototype;
Intl.NumberFormat.supportedLocalesOf = OrigNumberFormat.supportedLocalesOf;

const origToLocaleString = Number.prototype.toLocaleString;
Number.prototype.toLocaleString = function (
  this: number,
  locales: Intl.LocalesArgument = "en-US",
  options?: Intl.NumberFormatOptions,
) {
  return origToLocaleString.call(this, locales || "en-US", options);
};
