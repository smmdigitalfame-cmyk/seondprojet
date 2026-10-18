import { useEffect, useState } from "react";
import { ArrowLeft, ChevronRight, Check, History, Gift, ArrowUpRight, Link2, Send } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import iconBestPractices from "@/assets/icon-bestpractices.png";
import iconInspiration from "@/assets/icon-inspiration.png";
import iconBranded from "@/assets/icon-branded.png";
import iconTrialReels from "@/assets/icon-trial-reels.png";
import iconSettingsGear from "@/assets/icon-settings-gear.png";
import { getPersistentJson, setPersistentJson } from "@/lib/persistentStorage";
import InsightDetailSkeleton from "@/components/InsightDetailSkeleton";

interface DashboardData {
  views: string;
  interactions: string;
  newFollowers: string;
  contentShared: string;
  dateRangeLabel: string;
}

const defaultData: DashboardData = {
  views: "11.6K",
  interactions: "1.4K",
  newFollowers: "54",
  contentShared: "14",
  dateRangeLabel: "10 Feb-11 Mar",
};

const AnalyticsScreen = () => {
  const navigate = useNavigate();
  const [data, setData] = useState<DashboardData>(() => getPersistentJson("ig_dashboard_data_v2", defaultData));

  const [isEditing, setIsEditing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setIsLoading(false), 550);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    setPersistentJson("ig_dashboard_data_v2", data);
  }, [data]);

  const saveChanges = () => {
    setPersistentJson("ig_dashboard_data_v2", data);
    setIsEditing(false);
  };

  const updateField = (field: keyof DashboardData, value: string) => {
    setData(prev => ({ ...prev, [field]: value }));
  };

  const insightRows = [
    { label: "Views", value: data.views, field: "views" as keyof DashboardData, hasArrow: true, route: "/analytics/views" },
    { label: "New followers", value: data.newFollowers, field: "newFollowers" as keyof DashboardData, hasArrow: true, route: "/analytics/followers" },
    { label: "Content you shared", value: data.contentShared, field: "contentShared" as keyof DashboardData, hasArrow: false, route: null },
  ];

  const toolItems = [
    { label: "Monthly recap", icon: <History size={24} strokeWidth={2.2} />, badge: "New", subtitle: "See what you made happen last month." },
    { label: "Best practices", icon: <img src={iconBestPractices} alt="" className="w-[24px] h-[24px] object-contain dark:invert" />, badge: "New" },
    { label: "Inspiration", icon: <img src={iconInspiration} alt="" className="w-[24px] h-[24px] object-contain dark:invert" /> },
    { label: "Partnership ads", icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 9.5 6.2 11.7 10 7.9"/><circle cx="16" cy="7.5" r="3"/><path d="M10.5 19.5v-.8c0-3.15 2.55-5.7 5.7-5.7h.2c3.15 0 5.6 2.55 5.6 5.7v.8"/></svg> },
    { label: "Ad tools", icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M3.5 16.5 8 12l3.3 3.2L18 8.5"/><path d="M14.7 8.5H18v3.3"/></svg> },
    { label: "Branded content", icon: <img src={iconBranded} alt="" className="w-[24px] h-[24px] object-contain dark:invert" />, subtitle: "Partner with a brand or creator for your next post" },
    { label: "Trial reels", icon: <img src={iconTrialReels} alt="" className="w-[22px] h-[22px] object-contain dark:invert" />, badge: "New" },
    { label: "Gifts", icon: <Gift size={24} strokeWidth={2.2} /> },
    { label: "Saved replies", icon: <Send size={24} strokeWidth={2.2} />, subtitle: "Save replies to common questions" },
  ];

  const tipItems = [
    { label: "Trending audio", icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 17 7 13 11 16 17 7 21 11"/></svg> },
    { label: "Other helpful resources", icon: <Link2 size={24} strokeWidth={2.2} /> },
  ];

  if (isLoading) return <InsightDetailSkeleton />;

  return (
    <div className="pb-4 min-h-screen bg-background select-none overflow-x-hidden relative text-foreground">
      {/* Header */}
      <header className="sticky top-0 z-40 flex items-center justify-between px-4 h-[48px] bg-background">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate('/profile')} className="text-foreground">
            <ArrowLeft size={24} strokeWidth={2} />
          </button>
          <h1
            className="text-[17px] font-bold select-none"
            onDoubleClick={() => { setIsEditing(e => !e); if (window.navigator.vibrate) window.navigator.vibrate(50); }}
          >Professional dashboard</h1>
        </div>
        <div className="flex items-center gap-3">
          {isEditing && (
            <button onClick={saveChanges} className="bg-[#0095f6] text-white p-1.5 rounded-full shadow-lg">
              <Check size={18} strokeWidth={3} />
            </button>
          )}
          <button onClick={() => navigate('/analytics/settings')} className="w-[40px] h-[40px] flex items-center justify-center">
            <img src={iconSettingsGear} alt="Settings" className="w-[38px] h-[38px] object-contain dark:invert" />
          </button>
        </div>
      </header>

      <div>
        {/* Insights Section */}
        <div className="px-4 pt-5 pb-3">
          <div className="flex justify-between items-center mb-2">
            <h2 className="text-[15px] font-bold text-foreground">Insights</h2>
            {isEditing ? (
              <input 
                className="text-[13px] text-muted-foreground bg-secondary rounded px-2 py-0.5 outline-none text-right w-28" 
                value={data.dateRangeLabel} 
                onChange={e => updateField('dateRangeLabel', e.target.value)} 
              />
            ) : (
              <span className="text-[13px] text-muted-foreground">{data.dateRangeLabel}</span>
            )}
          </div>
          
          {/* Thin line under insights header */}
          <div className="h-px bg-border/60 mb-1" />
          
          <div>
            {insightRows.map((row, i) => (
              <div 
                key={row.field}
                onClick={() => !isEditing && row.route && navigate(row.route)} 
                className="flex justify-between items-center h-[44px] cursor-pointer"
              >
                <span className="text-[14px] text-foreground">{row.label}</span>
                <div className="flex items-center gap-1">
                  {row.hasArrow && !isEditing && (
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="text-green-500">
                      <line x1="10" y1="14" x2="18" y2="6" />
                      <polyline points="12 6 18 6 18 12" />
                    </svg>
                  )}
                  {isEditing ? (
                    <input 
                      className="bg-secondary rounded px-2 py-0.5 w-20 text-right font-semibold text-[14px] outline-none text-foreground" 
                      value={row.value} 
                      onChange={e => updateField(row.field, e.target.value)} 
                    />
                  ) : (
                    <span className="text-[14px] font-semibold text-foreground">{row.value}</span>
                  )}
                  <ChevronRight size={15} className="text-muted-foreground/60" strokeWidth={2} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Thick separator */}
        <div className="h-[6px] bg-secondary/50" />

        {/* Your tools Section */}
        <div className="px-4 pt-4 pb-2">
          <div className="flex justify-between items-center mb-2">
            <h2 className="text-[15px] font-bold text-foreground">Your tools</h2>
            <button className="text-[14px] text-[#0095f6] font-semibold">See all</button>
          </div>

          <div>
            {toolItems.map((tool, i) => (
              <div key={i} className="flex items-center gap-4 h-[52px]">
                <div className="text-foreground w-[28px] flex items-center justify-center shrink-0">
                  {tool.icon}
                </div>
                <div className="flex-1 flex items-center justify-between min-w-0">
                  <div className="flex flex-col min-w-0 flex-1">
                    <span className="text-[14px] text-foreground">{tool.label}</span>
                    {tool.subtitle && (
                      <span className="text-[12px] text-muted-foreground leading-tight mt-0.5 truncate">
                        {tool.subtitle}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 ml-2 shrink-0">
                    {tool.badge && (
                      <span className="bg-[#4F46E5] text-white text-[11px] font-bold px-2 py-[1px] rounded-full">
                        {tool.badge}
                      </span>
                    )}
                    <ChevronRight size={15} className="text-muted-foreground/60" strokeWidth={2} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Thick separator */}
        <div className="h-[6px] bg-secondary/50" />

        {/* Tips and resources */}
        <div className="px-4 pt-4 pb-6">
          <h2 className="text-[15px] font-bold text-foreground mb-2">Tips and resources</h2>
          <div>
            {tipItems.map((tip, i) => (
              <div key={i} className="flex items-center gap-4 h-[52px]">
                <div className="text-foreground w-[28px] flex items-center justify-center shrink-0">
                  {tip.icon}
                </div>
                <div className="flex-1 flex items-center justify-between">
                  <span className="text-[14px] text-foreground">{tip.label}</span>
                  <ChevronRight size={15} className="text-muted-foreground/60" strokeWidth={2} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <AnimatePresence>
        {isEditing && (
          <motion.div 
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            className="fixed bottom-10 left-0 right-0 flex justify-center z-[60]"
          >
            <button 
              onClick={saveChanges}
              className="bg-[#0095f6] text-white font-bold py-3 px-10 rounded-full shadow-2xl active:scale-[0.98] flex items-center gap-2 text-[14px]"
            >
              <Check size={18} strokeWidth={3} />
              SAVE CHANGES
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default AnalyticsScreen;
