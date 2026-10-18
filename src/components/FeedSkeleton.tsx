import { cn } from "@/lib/utils";

/** Story tray placeholders shown until real story accounts resolve. */
export function StoriesSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="flex gap-2 overflow-hidden px-3 pt-4 pb-3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex w-[74px] shrink-0 flex-col items-center gap-1.5">
          <div className="h-[66px] w-[66px] rounded-full shimmer" />
          <div className="h-2.5 w-12 rounded shimmer" />
        </div>
      ))}
    </div>
  );
}

/** Single feed post placeholder. */
export function PostSkeleton() {
  return (
    <div className="space-y-3 py-3">
      <div className="flex items-center gap-2 px-3">
        <div className="h-8 w-8 rounded-full shimmer" />
        <div className="h-3 w-32 rounded shimmer" />
      </div>
      <div className="aspect-square w-full shimmer" />
      <div className="space-y-2 px-3">
        <div className="h-3 w-40 rounded shimmer" />
        <div className="h-3 w-2/3 rounded shimmer" />
      </div>
    </div>
  );
}

export function FeedSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div>
      {Array.from({ length: count }).map((_, i) => (
        <PostSkeleton key={i} />
      ))}
    </div>
  );
}

/** Square media grid placeholder (profile / search results). */
export function GridSkeleton({ count = 9, className }: { count?: number; className?: string }) {
  return (
    <div className={cn("grid grid-cols-3 gap-[2px]", className)}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="aspect-square w-full shimmer" />
      ))}
    </div>
  );
}

/** Profile header placeholder used while an account is being cloned/loaded. */
export function ProfileHeaderSkeleton() {
  return (
    <div className="space-y-4 px-4 py-4">
      <div className="flex items-center gap-6">
        <div className="h-[86px] w-[86px] rounded-full shimmer" />
        <div className="flex flex-1 justify-around">
          {[0, 1, 2].map((i) => (
            <div key={i} className="space-y-2">
              <div className="mx-auto h-3.5 w-10 rounded shimmer" />
              <div className="mx-auto h-2.5 w-14 rounded shimmer" />
            </div>
          ))}
        </div>
      </div>
      <div className="space-y-2">
        <div className="h-3 w-32 rounded shimmer" />
        <div className="h-3 w-52 rounded shimmer" />
        <div className="h-3 w-40 rounded shimmer" />
      </div>
      <div className="flex gap-2">
        <div className="h-8 flex-1 rounded-lg shimmer" />
        <div className="h-8 flex-1 rounded-lg shimmer" />
      </div>
    </div>
  );
}
