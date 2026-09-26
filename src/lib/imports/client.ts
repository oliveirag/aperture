"use client";
import { browserClient } from "@/lib/supabase/browser";
export async function importFetch(url: string, init: RequestInit = {}) {
 if (init.method === "POST" && url !== "/api/imports/logout") sessionStorage.setItem("lookthrough-imports-used", "true");
 const session = await browserClient()?.auth.getSession();
 const headers = new Headers(init.headers);
 if (session?.data.session) headers.set("Authorization", `Bearer ${session.data.session.access_token}`);
 return fetch(url, { ...init, headers });
}

export async function cancelImportDrafts() {
 if (!sessionStorage.getItem("lookthrough-imports-used")) return;
 const response = await importFetch("/api/imports/logout", {method:"POST"});
 if (!response.ok) throw new Error("Unable to cancel import drafts. Please retry signing out.");
 sessionStorage.removeItem("lookthrough-imports-used");
}
