import { Images, Ruler, Shuffle, X } from 'lucide-react';
import { useId, useMemo, useState } from 'react';
import { KITCHEN_DESIGNS } from '../../domain/kitchens';
import { dealHand, randomSeed } from '../../domain/shuffle';
import { useT } from '../../i18n';
import { applyKitchenDesign } from '../../store/actions';
import { useUiStore } from '../../store/uiStore';
import { Button } from '../ui';

/** How many kitchens the empty plan offers at a time. */
const IDEAS_SHOWN = 3;

/**
 * What an empty project opens with: three kitchens to start from, a way to see
 * others, and the two slower routes of the full gallery or an empty room.
 */
export function StartGuide({ compact, isEmpty }: { compact: boolean; isEmpty: boolean }) {
  const t = useT();
  const titleId = useId();
  const [dismissed, setDismissed] = useState(false);
  const [deal, setDeal] = useState(() => ({ seed: randomSeed(), hand: 0 }));
  const [announce, setAnnounce] = useState(false);
  const dragging = useUiStore((state) => state.libraryDrag !== null);
  const ideas = useMemo(() => dealHand(KITCHEN_DESIGNS, IDEAS_SHOWN, deal.seed, deal.hand), [deal]);
  // Dismissing lasts for as long as this project stays open, also after its last unit is removed.
  if (dismissed || dragging || !isEmpty) return null;
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-4 pb-20 pt-12">
      <section aria-labelledby={titleId} className="studio-panel pointer-events-auto relative w-full max-w-xl rounded-2xl border p-4 shadow-[0_12px_40px_#332f281f] sm:p-5">
        <Button aria-label={t.canvas.dismissStart} title={t.canvas.dismissStart} className="absolute right-2 top-2" onClick={() => setDismissed(true)}>
          <X className="size-4" />
        </Button>
        <h2 id={titleId} className="pr-8 text-lg font-semibold text-studio-ink">{t.canvas.startTitle}</h2>
        <p className="mt-1.5 text-[13px] leading-relaxed text-studio-muted">{t.canvas.startIntro}</p>

        <ul aria-label={t.kitchens.ideas} className="start-ideas mt-3 grid grid-cols-3 gap-2 sm:mt-4 sm:gap-3">
          {ideas.map((kitchen) => {
            const name = t.kitchens.names[kitchen.id];
            return (
              <li key={kitchen.id} className="start-idea min-w-0">
                <button
                  type="button"
                  data-kitchen-idea={kitchen.id}
                  aria-label={t.kitchens.open(name)}
                  title={t.kitchens.open(name)}
                  onClick={() => applyKitchenDesign(kitchen)}
                  className="kitchen-card group block w-full min-w-0 overflow-hidden rounded-xl border border-studio-line bg-studio-paper text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-studio-accent focus-visible:ring-offset-2"
                >
                  <img src={`${import.meta.env.BASE_URL}kitchens/${kitchen.id}.jpg`} alt="" width={900} height={600} decoding="async" className="aspect-3/2 w-full bg-[#ebe8e3] object-cover" />
                  <span className="block truncate px-2 py-1.5 text-[11px] font-medium text-studio-ink sm:px-2.5 sm:text-xs">{name}</span>
                </button>
              </li>
            );
          })}
        </ul>
        <p aria-live="polite" className="sr-only">{announce ? t.kitchens.showing(ideas.map((kitchen) => t.kitchens.names[kitchen.id]).join(', ')) : ''}</p>

        <div className="mt-3 flex flex-wrap gap-2 sm:mt-4">
          <Button variant="outline" className="start-ideas h-11 px-3 text-xs" title={t.kitchens.shuffleIdeasTitle}
            onClick={() => { setDeal((current) => ({ seed: current.seed, hand: current.hand + 1 })); setAnnounce(true); }}>
            <Shuffle className="size-4 shrink-0" />{t.kitchens.shuffleIdeas}
          </Button>
          <Button variant="primary" className="h-11 min-w-0 flex-1 basis-40 px-3 text-xs" onClick={() => useUiStore.getState().setLayoutsOpen(true)}>
            <Images className="size-4 shrink-0" />{t.canvas.startFromLayout}
          </Button>
          <Button variant="outline" className="h-11 min-w-0 flex-1 basis-40 px-3 text-xs" onClick={() => { setDismissed(true); useUiStore.getState().setRoomOpen(true); }}>
            <Ruler className="size-4 shrink-0" />{t.canvas.startWithRoom}
          </Button>
        </div>
        <p className="start-hint mt-3 text-xs leading-relaxed text-studio-muted">{compact ? t.canvas.emptyTouch : t.canvas.emptyDesktop}</p>
      </section>
    </div>
  );
}
