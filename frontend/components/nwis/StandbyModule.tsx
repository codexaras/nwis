import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { DataChip } from "./DataChip";
import { PageHeader } from "./PageHeader";
import { SectionCard } from "./SectionCard";
import { SkeletonList, SkeletonText, SkeletonTrack } from "./Skeletons";

interface Props {
  question: string;
  heroTitle: string;
  heroSubtitle: string;
  icon: LucideIcon;
  /** what the hero visual will be; shown as a HUD note inside the hero skeleton */
  heroNote: string;
  secondary: { title: string; subtitle: string }[];
  controls?: ReactNode;
  layout?: "track" | "list";
}

/**
 * Intentional standby layout for modules whose signature visual is built in a later phase.
 * Keeps the page composed (hero + secondary + tertiary) so nothing ever renders blank.
 */
export function StandbyModule({ question, heroTitle, heroSubtitle, icon: Icon, heroNote, secondary, controls, layout = "track" }: Props) {
  return (
    <div className="space-y-4 p-4">
      <PageHeader question={question}>{controls}</PageHeader>
      <div className="grid grid-cols-12 gap-4">
        <SectionCard className="col-span-12 xl:col-span-8" variant="hero" title={heroTitle} subtitle={heroSubtitle} actions={<DataChip variant="amber">Module standby</DataChip>}>
          <div className="relative">
            {layout === "track" ? <SkeletonTrack height={460} tracks={4} /> : <SkeletonList rows={8} />}
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="flex items-center gap-3 rounded-md border border-border-strong bg-surface/90 px-4 py-3 shadow-card backdrop-blur">
                <Icon className="h-5 w-5 text-amber" />
                <div>
                  <div className="text-body font-medium text-text">{heroNote}</div>
                  <div className="hud-label">Signature visual · scheduled for the next build phase</div>
                </div>
              </div>
            </div>
          </div>
        </SectionCard>
        <div className="col-span-12 flex flex-col gap-4 xl:col-span-4">
          {secondary.map((s) => (
            <SectionCard key={s.title} title={s.title} subtitle={s.subtitle} className="flex-1">
              <SkeletonText lines={4} />
            </SectionCard>
          ))}
        </div>
      </div>
    </div>
  );
}
