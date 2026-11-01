/** Port: tells whether the database answers. Implemented by the persistence adapter. */
export interface DatabaseHealth {
  /** Resolves true when the database answers a trivial query, false otherwise. Never rejects. */
  isReachable(): Promise<boolean>;
}
