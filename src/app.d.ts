// Pure client-side app — no server locals.
declare global {
  namespace App {}
  const __BUILD_SHA__: string;
  const __BUILD_TIME__: string;
}

export {};
