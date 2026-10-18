const AudienceSkeleton = () => (
  <div className="px-4 pb-8 animate-pulse">
    {[0, 1, 2, 3].map((s) => (
      <section key={s} className="py-5 border-b border-border last:border-0">
        <div className="h-[19px] w-40 rounded bg-secondary mb-4" />
        <div className="space-y-3">
          {[0, 1, 2, 3].map((i) => (
            <div key={i}>
              <div className="h-[13px] w-24 rounded bg-secondary mb-1" />
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

export default AudienceSkeleton;
