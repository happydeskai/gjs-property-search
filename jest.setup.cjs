require("@testing-library/jest-dom");

// The jsdom test environment does not expose these Node globals, but the standalone
// `jsdom` package used inside the tests requires them (via whatwg-url).
const { TextEncoder, TextDecoder } = require("util");
if (typeof global.TextEncoder === "undefined") global.TextEncoder = TextEncoder;
if (typeof global.TextDecoder === "undefined") global.TextDecoder = TextDecoder;
