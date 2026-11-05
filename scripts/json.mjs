/** Decode JSON at an untrusted boundary; callers must validate or explicitly narrow its shape.
 * @param {string} text
 * @returns {unknown}
 */
export function decodeJson(text) {
  return JSON.parse(text);
}
