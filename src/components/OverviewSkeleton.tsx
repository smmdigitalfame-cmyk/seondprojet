const OverviewSkeleton = () => (
  <div className="animate-pulse">
    <div className="flex gap-3 px-4 pb-4">
      {[0, 1].map((i) => (
        <div key={i} className="shrink-0 w-[45%] min-w-[150px] rounded-[14px] px-4 py-3.5 bg-secondary/60 border-[3px] border-transparent">
          <div className="h-[13px] w-20 rounded bg-secondary mb-3" />
          <div className="h-[22px] w-16 rounded bg-secondary" />
        </div>
      ))}
    </div>

    <div className="px-4">
      <div className="h-[150px] w-full rounded-[12px] bg-secondary/60" />
      <div className="flex justify-between mt-2">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-[11px] w-12 rounded bg-secondary" />
        ))}
      </div>
    </div>

    {[0, 1].map((s) => (
      <section key={s} className="px-4 py-5 border-b border-border last:border-0">
        <div className="h-[19px] w-44 rounded bg-secondary mb-4" />
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i}>
              <div className="h-[13px] w-20 rounded bg-secondary mb-1" />
              <div className="flex items-center gap-2">
                <div className="flex-1 h-[8px] rounded-full ig-bar-track" />
                <div className="h-[13px] w-10 rounded bg-secondary" />
              </div>
            </div>
          ))}
        </div>
      </section>
    ))}
  </div>
);

export default OverviewSkeleton;
