import { Suspense } from "react";
import Generate from "@/components/Generate";
export const metadata = { title: "Investigating… · Greenlight" };
export default function Page() {
  return <Suspense fallback={null}><Generate /></Suspense>;
}
