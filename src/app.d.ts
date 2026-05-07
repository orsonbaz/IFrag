import type { getDb } from '$lib/db/client';

declare global {
  namespace App {
    interface Locals {
      db: ReturnType<typeof getDb>;
    }
  }
}

export {};
