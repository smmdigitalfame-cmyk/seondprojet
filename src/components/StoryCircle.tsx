import { Plus } from "lucide-react";
import type { Story } from "@/data/mockData";
import { cn } from "@/lib/utils";

interface StoryCircleProps {
  story: Story;
  onClick?: () => void;
}

const StoryCircle = ({ story, onClick }: StoryCircleProps) => (
  <button
    className="flex flex-col items-center gap-1 min-w-[86px] active:scale-95 transition-transform duration-150"
    onClick={onClick}
  >
    <div className="relative">
      <div className={cn(
        "rounded-full",
        story.isOwn
          ? "border-[2px] border-muted-foreground/40 bg-background p-[2px]"
          : story.isLive
            ? "bg-gradient-to-bl from-[#FF70A6] via-[#FF70A6] to-[#FFD600] p-[2.5px]"
            : "story-ring p-[2.5px]"
      )}>
        <div className="rounded-full bg-background p-[2px]">
          <img
            src={story.avatar}
            alt={story.username}
            className="h-[70px] w-[70px] rounded-full object-cover bg-secondary"
            loading="eager"
            decoding="async"
            draggable={false}
            onError={(e) => {
              const img = e.currentTarget;
              if (img.dataset.fallback) return;
              img.dataset.fallback = "1";
              img.src = `https://ui-avatars.com/api/?background=random&name=${encodeURIComponent(story.username)}`;
            }}
          />
        </div>
      </div>
      {story.isOwn && (
        <div className="absolute bottom-[2px] right-[2px] flex h-[18px] w-[18px] items-center justify-center rounded-full border-[2px] border-background bg-foreground text-background">
          <Plus size={10} strokeWidth={3} />
        </div>
      )}
      {story.isLive && (
        <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 rounded-[3px] bg-gradient-to-bl from-[#FF70A6] via-[#FF70A6] to-[#FFD600] px-[4px] py-[1px] text-[8px] font-bold text-white uppercase tracking-wide border-[1.5px] border-background">
          Live
        </div>
      )}
    </div>
    <span className={cn(
      "w-[86px] truncate text-center text-[11px]",
      story.isLive ? "text-[hsl(var(--ig-like))] font-medium" : "text-foreground"
    )}>
      {story.username}
    </span>
  </button>
);

export default StoryCircle;