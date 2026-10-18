import { Skeleton } from "@/components/ui/skeleton";

const ContentListSkeleton = ({ rows = 7 }: { rows?: number }) => {
  return (
    <div className="px-3 sm:px-4">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-start gap-2.5 sm:gap-3 py-3">
          <Skeleton className="w-[48px] sm:w-[52px] h-[62px] sm:h-[68px] rounded-[4px] shrink-0 bg-muted" />
          <div className="flex-1 min-w-0 pt-0.5">
            <Skeleton className="h-[15px] sm:h-[16px] w-[70%] rounded bg-muted" />
            <div className="flex flex-wrap gap-x-2.5 sm:gap-x-3.5 gap-y-1.5 mt-2.5">
              <Skeleton className="h-[14px] w-10 rounded bg-muted" />
              <Skeleton className="h-[14px] w-10 rounded bg-muted" />
              <Skeleton className="h-[14px] w-10 rounded bg-muted" />
              <Skeleton className="h-[14px] w-10 rounded bg-muted" />
            </div>
          </div>
          <div className="shrink-0 pl-1 sm:pl-2 pt-0.5 text-right">
            <Skeleton className="h-[17px] sm:h-[19px] w-12 rounded bg-muted mb-1.5" />
            <Skeleton className="h-[12px] sm:h-[13px] w-9 rounded bg-muted ml-auto" />
          </div>
        </div>
      ))}
    </div>
  );
};

export default ContentListSkeleton;
