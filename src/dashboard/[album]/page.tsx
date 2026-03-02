import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { fetchAlbum, type GalleryAlbumDetail, type GalleryMediaItem } from 'src/_functions/galleryApi';
import { useTranslator } from 'src/_functions/translator';

import MediaLightbox from '../_components/MediaLightbox';
import ProgressiveMedia from '../_components/ProgressiveMedia';
import { getAlbumThemeClasses } from '../_components/albumThemeStyles';

export const template = 'plain';

interface PageProps {
  params: {
    album?: string;
  };
}

export default function AlbumPage({ params }: PageProps) {
  const translate = useTranslator();
  const navigate = useNavigate();

  const [album, setAlbum] = useState<GalleryAlbumDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [lightboxItems, setLightboxItems] = useState<GalleryMediaItem[]>([]);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  const folder = params.album ?? '';

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      if (!folder) {
        setAlbum(null);
        setLoading(false);
        return;
      }

      const response = await fetchAlbum({ folder });
      setAlbum(response);
      setLoading(false);
    };

    void load();
  }, [folder]);

  const mediaItems = useMemo(() => album?.media ?? [], [album?.media]);

  return (
    <div className={`h-safe w-full overflow-y-auto bg-background text-title`}>
      <div className={`mx-auto flex w-full max-w-6xl flex-col gap-3 p-3`}>
        <div className={`flex items-center justify-between rounded-xl border border-container1-border bg-container1 p-3`}>
          <button className={`rounded-lg border border-container1-border bg-container2 px-3 py-2 text-sm`} onClick={() => void navigate('/dashboard')}>
            {translate({ key: 'gallery.backToDashboard' })}
          </button>
          <button className={`rounded-lg border border-container1-border bg-container2 px-3 py-2 text-sm`} onClick={() => void navigate('/upload')}>
            {translate({ key: 'gallery.openUpload' })}
          </button>
        </div>

        {loading && (
          <div className={`rounded-xl border border-container1-border bg-container1 p-4 text-common`}>
            {translate({ key: 'gallery.loading' })}
          </div>
        )}

        {!loading && !album && (
          <div className={`rounded-xl border border-container1-border bg-container1 p-4 text-common`}>
            {translate({ key: 'gallery.albumNotFound' })}
          </div>
        )}

        {!loading && album && (
          <>
            <div className={`rounded-xl border p-3 ${getAlbumThemeClasses(album.theme)}`}>
              <div className={`text-xl font-semibold text-title`}>{album.title}</div>
              <div className={`text-sm text-common`}>
                {translate({ key: 'gallery.imageCount', params: [{ key: 'count', value: album.imageCount }] })}
              </div>
            </div>

            <div className={`grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4`}>
              {mediaItems.map((media, index) => (
                <div key={media.fileName} className={`h-44 overflow-hidden rounded-xl border border-container1-border bg-container1`}>
                  <ProgressiveMedia
                    media={media}
                    alt={media.fileName}
                    className={`h-full w-full`}
                    onClick={() => {
                      setLightboxItems(mediaItems);
                      setLightboxIndex(index);
                    }}
                  />
                </div>
              ))}
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
