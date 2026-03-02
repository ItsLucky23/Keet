import { useEffect, useMemo, useState } from 'react';
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
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [lightboxItems, setLightboxItems] = useState<GalleryMediaItem[]>([]);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [albumTextTone, setAlbumTextTone] = useState<Record<string, 'light' | 'dark'>>({});

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const data = await fetchDashboardData();
      setPayload(data);
      setLoading(false);
    };
    void load();
  }, []);

  const filteredAlbums = useMemo(() => {
    if (!payload) return [];
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return payload.albums;
    return payload.albums.filter((album) => {
      return album.title.toLowerCase().includes(normalizedQuery) || album.folder.toLowerCase().includes(normalizedQuery);
    });
  }, [payload, query]);

  const showLightbox = (items: GalleryMediaItem[], index: number) => {
    setLightboxItems(items);
    setLightboxIndex(index);
  };

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
      <div className={`mx-auto flex w-full max-w-6xl flex-col gap-4 p-3`}>
        <div className={`flex items-center gap-2`}>
          <input
            className={`w-full rounded-xl border border-container1-border bg-container1 px-3 py-2 text-title outline-none`}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={translate({ key: 'gallery.searchAlbums' })}
          />
          {canOpenUpload && (
            <button
              className={`shrink-0 rounded-xl border border-primary-border bg-primary px-3 py-2 text-sm font-semibold text-title-primary hover:bg-primary-hover`}
              onClick={() => void navigate('/upload')}
            >
              {translate({ key: 'gallery.openUpload' })}
            </button>
          )}
        </div>

        {loading && (
          <div className={`rounded-xl border border-container1-border bg-container1 p-4 text-common`}>
            {translate({ key: 'gallery.loading' })}
          </div>
        )}

        {!loading && payload && (
          <>
            {payload.carousels.map((carouselItems, carouselIndex) => (
              <div key={`carousel-${carouselIndex}`} className={`flex flex-col gap-2 rounded-xl border border-container1-border bg-container1 p-2`}>
                <div className={`px-1 text-sm text-common`}>
                  {carouselIndex === 0 ? translate({ key: 'gallery.carouselOne' }) : translate({ key: 'gallery.carouselTwo' })}
                </div>
                <div className={`flex gap-2 overflow-x-auto pb-1`}>
                  {carouselItems.map((item, itemIndex) => (
                    <div key={`${item.folder ?? 'unknown'}-${item.fileName}-${itemIndex}`} className={`h-28 w-28 shrink-0 overflow-hidden rounded-lg border border-container1-border`}>
                      <ProgressiveMedia
                        media={item}
                        alt={item.fileName}
                        className={`h-full w-full`}
                        onClick={() => showLightbox(carouselItems, itemIndex)}
                      />
                    </div>
                  ))}
                </div>
              </div>
            ))}

            <div className={`grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4`}>
              {filteredAlbums.map((album) => {
                const useLightText = albumTextTone[album.folder] === 'light';

                return (
                  <button
                    key={album.folder}
                    className={`flex flex-col overflow-hidden rounded-xl border ${getAlbumThemeClasses(album.theme)} text-left`}
                    onClick={() => void navigate(`/dashboard/${album.folder}`)}
                  >
                    <div className={`h-28 w-full bg-container2`}>
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
                    <div className={`flex flex-col gap-1 p-2 ${useLightText ? 'text-title-primary' : 'text-title'}`}>
                      <div className={`line-clamp-1 text-sm font-semibold`}>{album.title}</div>
                      <div className={`text-xs ${useLightText ? 'text-common-primary' : 'text-common'}`}>
                        {translate({ key: 'gallery.imageCount', params: [{ key: 'count', value: album.imageCount }] })}
                      </div>
                      <div className={`text-xs ${useLightText ? 'text-common-primary' : 'text-common'}`}>
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