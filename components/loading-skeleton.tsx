import { Skeleton } from "@/components/ui/skeleton"

export function LoadingSkeleton() {
  return (
    <div className="flex flex-col h-full space-y-8 px-4 md:px-8 py-8 animate-in fade-in duration-200">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="space-y-2">
          <Skeleton className="h-10 w-[250px]" />
          <Skeleton className="h-4 w-[400px]" />
        </div>
        <div className="flex gap-3">
          <Skeleton className="h-10 w-[120px]" />
          <Skeleton className="h-10 w-[120px]" />
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-32 w-full rounded-2xl" />
        ))}
      </div>

      <div className="grid gap-6 md:grid-cols-7">
        <Skeleton className="md:col-span-4 h-[400px] w-full rounded-2xl" />
        <Skeleton className="md:col-span-3 h-[400px] w-full rounded-2xl" />
      </div>

      <Skeleton className="h-[300px] w-full rounded-2xl" />
    </div>
  )
}
