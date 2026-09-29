import { randomInt } from "node:crypto";

/** A random numeric keypad code (default 6 digits, never starts with 0). */
export function generateCode(length = 6) {
  let out = String(randomInt(1, 10));
  for (let i = 1; i < length; i++) out += String(randomInt(0, 10));
  return out;
}
