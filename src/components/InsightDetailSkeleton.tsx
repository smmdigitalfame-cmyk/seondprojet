import { Skeleton } from "@/components/ui/skeleton";

const InsightDetailSkeleton = () => {
  return (
    <div className="min-h-screen bg-background animate-fade-in">
      {/* Header */}
      <div className="sticky top-0 z-40 flex items-center justify-between px-4 h-[48px] bg-background">
        <div className="flex items-center gap-4">
          <Skeleton className="h-6 w-6 rounded" />
          <Skeleton className="h-4 w-32 rounded" />
        </div>
        <Skeleton className="h-6 w-6 rounded-full" />
      </div>

      <div className="px-4 pt-4 space-y-6">
        {/* Date pill */}
        <Skeleton className="h-8 w-36 rounded-full" />

        {/* Big metric */}
        <div className="space-y-3">
          <Skeleton className="h-4 w-24 rounded" />
          <Skeleton className="h-10 w-40 rounded" />
          <Skeleton className="h-3 w-56 rounded" />
        </div>

        {/* Bar / chart */}
        <Skeleton className="h-3 w-full rounded-full" />
        <div className="flex items-center gap-4">
          <Skeleton className="h-3 w-20 rounded" />
          <Skeleton className="h-3 w-20 rounded" />
        </div>

        {/* Section title */}
        <div className="pt-2 space-y-3">
          <Skeleton className="h-4 w-40 rounded" />
          <Skeleton className="h-3 w-full rounded" />
          <Skeleton className="h-3 w-5/6 rounded" />
          <Skeleton className="h-3 w-4/6 rounded" />
        </div>

        {/* Top content grid */}
        <div className="pt-2 space-y-3">
          <Skeleton className="h-4 w-32 rounded" />
          <div className="grid grid-cols-4 gap-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="aspect-[3/4] w-full rounded-md" />
            ))}
          </div>
        </div>

        {/* Lists */}
        {Array.from({ length: 2 }).map((_, s) => (
          <div key={s} className="space-y-3 pt-2">
            <Skeleton className="h-4 w-36 rounded" />
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center justify-between">
                <Skeleton className="h-3 w-32 rounded" />
                <Skeleton className="h-3 w-10 rounded" />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
};

export default InsightDetailSkeleton;