// Isolation never manufactures a signed-in user or bypasses rate limits.
// CLI: APERTURE_LOCAL_VERIFICATION=1. Next/browser: also set the public flag before building,
// so both the browser bundle and server refuse remote storage. Still blank all remote credentials.
export function localVerification(): boolean {
  return process.env.APERTURE_LOCAL_VERIFICATION === "1" || process.env.NEXT_PUBLIC_APERTURE_LOCAL_VERIFICATION === "1";
}
