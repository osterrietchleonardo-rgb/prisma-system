"use client";

import { Suspense } from "react";
import { TrackingPerformanceView } from "@/components/tracking/TrackingPerformanceView";

export default function DirectorTrackingPerformancePage() {
  return (
    <Suspense fallback={null}>
      <TrackingPerformanceView isDirector={true} />
    </Suspense>
  );
}
