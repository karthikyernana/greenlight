import TraceView from "@/components/TraceView";
export const metadata = { title: "Run trace · Greenlight" };
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <TraceView id={id} />;
}
