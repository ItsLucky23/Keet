import { type PointerEvent, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { fetchDashboardData, type DashboardPayload, type GalleryMediaItem } from 'src/_functions/galleryApi';
import { useTranslator } from 'src/_functions/translator';

import MediaLightbox from './_components/MediaLightbox';
import ProgressiveMedia from './_components/ProgressiveMedia';
import { getAlbumThemeClasses } from './_components/albumThemeStyles';

export const template = 'plain';

export default function DashboardPage() {
  const translate = useTranslator();
  const navigate = useNavigate();
  const location = useLocation();

  const [payload, setPayload] = useState<DashboardPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [lightboxItems, setLightboxItems] = useState<GalleryMediaItem[]>([]);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [carouselItems, setCarouselItems] = useState<GalleryMediaItem[][]>([]);
  const [albumTextTone, setAlbumTextTone] = useState<Record<string, 'light' | 'dark'>>({});
  const carouselDragState = useRef<Record<number, { startX: number; scrollLeft: number; active: boolean; moved: boolean }>>({});
  const suppressCarouselClickUntil = useRef(0);
  const carouselRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const carouselInteraction = useRef<Record<number, { active: boolean; lastTouch: number }>>({});

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const data = await fetchDashboardData();
      setPayload(data);
      setLoading(false);
    };
    void load();
  }, []);

  const filteredAlbums = useMemo(() => payload?.albums ?? [], [payload]);

  const showLightbox = (items: GalleryMediaItem[], index: number) => {
    setLightboxItems(items);
    setLightboxIndex(index);
  };

  const startCarouselDrag = (index: number, event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    const target = event.currentTarget;
    target.setPointerCapture(event.pointerId);
    carouselDragState.current[index] = {
      startX: event.clientX,
      scrollLeft: target.scrollLeft,
      active: true,
      moved: false,
    };
    carouselInteraction.current[index] = { active: true, lastTouch: Date.now() };
  };

  const moveCarouselDrag = (index: number, event: PointerEvent<HTMLDivElement>) => {
    const state = carouselDragState.current[index];
    if (!state?.active) return;
    const target = event.currentTarget;
    const delta = event.clientX - state.startX;
    if (Math.abs(delta) > 4) state.moved = true;
    target.scrollLeft = state.scrollLeft - delta;
    const interaction = carouselInteraction.current[index] ?? { active: true, lastTouch: Date.now() };
    interaction.active = true;
    interaction.lastTouch = Date.now();
    carouselInteraction.current[index] = interaction;
  };

  const endCarouselDrag = (index: number, event: PointerEvent<HTMLDivElement>) => {
    const state = carouselDragState.current[index];
    if (!state) return;
    if (state.moved) {
      suppressCarouselClickUntil.current = Date.now() + 250;
    }
    state.active = false;
    state.moved = false;
    const interaction = carouselInteraction.current[index] ?? { active: false, lastTouch: Date.now() };
    interaction.active = false;
    interaction.lastTouch = Date.now();
    carouselInteraction.current[index] = interaction;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const canOpenCarouselItem = () => Date.now() > suppressCarouselClickUntil.current;

  useEffect(() => {
    if (!payload?.carousels) {
      setCarouselItems([]);
      return;
    }

    setCarouselItems(payload.carousels.map((items) => [...items]));
  }, [payload]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      Object.entries(carouselRefs.current).forEach(([key, element]) => {
        const index = Number(key);
        if (!element) return;
        const interaction = carouselInteraction.current[index];
        if (interaction?.active) return;
        if (interaction?.lastTouch && Date.now() - interaction.lastTouch < 1500) return;

        const maxScroll = element.scrollWidth - element.clientWidth;
        if (maxScroll <= 0) return;

        element.scrollLeft += 1;

        const firstItem = element.firstElementChild as HTMLElement | null;
        if (!firstItem) return;

        const computedStyle = window.getComputedStyle(element);
        const gapRaw = computedStyle.columnGap || computedStyle.gap || '0';
        const gap = Number.parseFloat(gapRaw) || 0;
        const firstWidthWithGap = firstItem.offsetWidth + gap;

        if (element.scrollLeft >= firstWidthWithGap) {
          setCarouselItems((current) => {
            const target = current[index];
            if (!target || target.length < 2) return current;
            const next = [...current];
            next[index] = [...target.slice(1), target[0]];
            return next;
          });
          element.scrollLeft -= firstWidthWithGap;
        }
      });
    }, 1);

    return () => {
      window.clearInterval(timer);
    };
  }, [carouselItems.length]);

  const canOpenUpload = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return params.get('admin') === 'true';
  }, [location.search]);

  useEffect(() => {
    if (!payload) {
      setAlbumTextTone({});
      return;
    }

    const computeTones = async () => {
      const entries = await Promise.all(payload.albums.map(async (album) => {
        const sampleUrl = album.coverUrls[0];
        if (!sampleUrl) {
          return [album.folder, 'dark'] as const;
        }

        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.src = sampleUrl;

        const loaded = await new Promise<boolean>((resolve) => {
          img.onload = () => resolve(true);
          img.onerror = () => resolve(false);
        });

        if (!loaded) {
          return [album.folder, 'dark'] as const;
        }

        const canvas = document.createElement('canvas');
        canvas.width = 12;
        canvas.height = 12;
        const context = canvas.getContext('2d');
        if (!context) {
          return [album.folder, 'dark'] as const;
        }

        context.drawImage(img, 0, 0, canvas.width, canvas.height);
        const { data } = context.getImageData(0, 0, canvas.width, canvas.height);

        let totalLuminance = 0;
        let pixels = 0;

        for (let i = 0; i < data.length; i += 4) {
          const red = data[i];
          const green = data[i + 1];
          const blue = data[i + 2];
          totalLuminance += (0.2126 * red) + (0.7152 * green) + (0.0722 * blue);
          pixels += 1;
        }

        const averageLuminance = pixels > 0 ? totalLuminance / pixels : 255;
        return [album.folder, averageLuminance < 140 ? 'light' : 'dark'] as const;
      }));

      setAlbumTextTone(Object.fromEntries(entries));
    };

    void computeTones();
  }, [payload]);

  return (
    <div className={`h-safe w-full overflow-y-auto bg-background text-title`}>
      <div className={`mx-auto flex w-full max-w-none flex-col gap-4 p-3`}>
        {canOpenUpload && (
          <div className={`flex justify-end`}>
            <button
              className={`rounded-xl border border-primary-border bg-primary px-4 py-2 text-sm font-semibold text-title-primary hover:bg-primary-hover`}
              onClick={() => void navigate('/upload')}
            >
              {translate({ key: 'gallery.openUpload' })}
            </button>
          </div>
        )}

        {loading && (
          <div className={`rounded-xl border border-container1-border bg-container1 p-4 text-common`}>
            {translate({ key: 'gallery.loading' })}
          </div>
        )}

        {!loading && payload && (
          <>
            {carouselItems.map((carouselList, carouselIndex) => (
              <div key={`carousel-${carouselIndex}`} className={`flex flex-col gap-2 rounded-xl border border-container1-border bg-container1 p-2`}>
                <div
                  ref={(element) => {
                    carouselRefs.current[carouselIndex] = element;
                  }}
                  className={`no-scrollbar flex gap-2 overflow-x-auto pb-1 cursor-grab select-none active:cursor-grabbing`}
                  onPointerDown={(event) => startCarouselDrag(carouselIndex, event)}
                  onPointerMove={(event) => moveCarouselDrag(carouselIndex, event)}
                  onPointerUp={(event) => endCarouselDrag(carouselIndex, event)}
                  onPointerLeave={(event) => endCarouselDrag(carouselIndex, event)}
                >
                  {carouselList.map((item, itemIndex) => (
                    <ProgressiveMedia
                      key={`${item.folder ?? 'unknown'}-${item.fileName}-${itemIndex}`}
                      media={item}
                      alt={item.fileName}
                      fit={`natural`}
                      className={`inline-flex h-[220px] w-auto max-w-[440px] shrink-0 overflow-hidden rounded-lg border border-container1-border`}
                      onClick={() => {
                        if (!canOpenCarouselItem()) return;
                        showLightbox(carouselList, itemIndex);
                      }}
                    />
                  ))}
                </div>
              </div>
            ))}

            <div className={`grid grid-cols-1 gap-10 md:grid-cols-3 md:justify-items-center`}>
              {filteredAlbums.map((album) => {
                const useLightText = albumTextTone[album.folder] === 'light';

                return (
                  <button
                    key={album.folder}
                    className={`flex w-full min-w-[200px] max-w-[400px] flex-col overflow-hidden rounded-xl border ${getAlbumThemeClasses(album.theme)} text-left`}
                    onClick={() => void navigate(`/dashboard/${album.folder}`)}
                  >
                    <div className={`h-56 w-full bg-container2`}>
                      {album.coverUrls.length > 0 ? (
                        <div className={`grid h-full w-full gap-[2px] ${album.coverUrls.length === 1 ? 'grid-cols-1' : album.coverUrls.length === 2 ? 'grid-cols-2' : 'grid-cols-2 grid-rows-2'}`}>
                          {album.coverUrls.slice(0, 4).map((coverUrl, index) => (
                            <img
                              key={`${album.folder}-cover-${index}`}
                              src={coverUrl}
                              alt={album.title}
                              className={`h-full w-full object-cover ${album.coverUrls.length === 3 && index === 0 ? 'row-span-2' : ''}`}
                              loading={`lazy`}
                            />
                          ))}
                        </div>
                      ) : (
                        <div className={`flex h-full w-full items-center justify-center text-sm text-common`}>
                          {translate({ key: 'gallery.noThumbnail' })}
                        </div>
                      )}
                    </div>
                    <div className={`flex flex-col gap-1 p-3 ${useLightText ? 'text-title-primary' : 'text-title'}`}>
                      <div className={`line-clamp-1 text-base font-semibold`}>{album.title}</div>
                      <div className={`text-sm ${useLightText ? 'text-common-primary' : 'text-common'}`}>
                        {translate({ key: 'gallery.imageCount', params: [{ key: 'count', value: album.imageCount }] })}
                      </div>
                      <div className={`text-sm ${useLightText ? 'text-common-primary' : 'text-common'}`}>
                        {new Date(album.updatedAt).toLocaleDateString()}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>

      {lightboxItems.length > 0 && (
        <MediaLightbox
          items={lightboxItems}
          activeIndex={lightboxIndex}
          onClose={() => setLightboxItems([])}
          onNext={() => setLightboxIndex((value) => (value + 1) % lightboxItems.length)}
          onPrevious={() => setLightboxIndex((value) => (value - 1 + lightboxItems.length) % lightboxItems.length)}
        />
      )}
    </div>
  );
}