"use client";

import { Suspense } from "react";
import { TrackingPerformanceView } from "@/components/tracking/TrackingPerformanceView";

export default function AsesorTrackingPerformancePage() {
  return (
    <Suspense fallback={null}>
      <TrackingPerformanceView isDirector={false} />
    </Suspense>
  );
}
