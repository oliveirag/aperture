import { redirect } from "next/navigation";

export default async function Page({ searchParams }: { searchParams: Promise<{ scenario?: string }> }) {
  const { scenario } = await searchParams;
  redirect(scenario ? `/shock?scenario=${encodeURIComponent(scenario)}` : "/shock");
}
