/** Port: session tokens. Implemented with Node's crypto by the security adapter. */
export interface SessionTokens {
  /** A new random token (256 bits), safe to put in a cookie. */
  generate(): string;
  /** True when the value has the shape of a token this service generates. */
  isWellFormed(value: string): boolean;
  /** The keyed hash stored in place of the token (HMAC-SHA-256 with SESSION_SECRET). */
  hash(token: string): string;
}
