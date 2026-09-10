import { Suspense } from "react";
import { HomeContent, HomeLoading } from "@/components/home-content";

export default function Home() {
  return (
    <Suspense fallback={<HomeLoading />}>
      <HomeContent />
    </Suspense>
  );
}
