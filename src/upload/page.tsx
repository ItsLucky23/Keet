import { ChangeEvent, DragEvent, useEffect, useMemo, useRef, useState } from 'react';
import { faEllipsisVertical } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { useNavigate } from 'react-router-dom';

import {
  createAlbumRequest,
  deleteAlbumRequest,
  deleteFilesRequest,
  fetchAdminAlbums,
  type GalleryAlbumDetail,
  type GalleryMediaItem,
  reorderAlbumRequest,
  updateAlbumRequest,
  uploadFilesRequest,
} from 'src/_functions/galleryApi';
import { confirmDialog } from 'src/_components/ConfirmMenu';
import Dropdown from 'src/_components/Dropdown';
import { menuHandler } from 'src/_functions/menuHandler';
import notify from 'src/_functions/notify';
import { useTranslator } from 'src/_functions/translator';

import ProgressiveMedia from '../dashboard/_components/ProgressiveMedia';
import MediaLightbox from '../dashboard/_components/MediaLightbox';
import { getAlbumThemeClasses } from '../dashboard/_components/albumThemeStyles';

export const template = 'plain';

const THEMES = ['default', 'carnaval', 'koningsdag', 'zomer', 'winter', 'halloween'];

function MediaOptionsMenu({
  canSetCover,
  isCover,
  isExtra,
  onToggleCover,
  onToggleExtra,
  onReplace,
  onDelete,
}: {
  canSetCover: boolean;
  isCover: boolean;
  isExtra: boolean;
  onToggleCover: () => void;
  onToggleExtra: () => void;
  onReplace: () => void;
  onDelete: () => void;
}) {
  const translate = useTranslator();

  return (
    <div className={`flex w-full max-w-xs flex-col gap-2 bg-container1 p-3`}>
      <div className={`text-sm font-semibold text-title`}>{translate({ key: 'gallery.options' })}</div>
      <button
        className={`rounded-lg border border-container1-border bg-container2 px-3 py-2 text-left text-sm text-title hover:bg-container2-hover ${!canSetCover ? 'opacity-50' : ''}`}
        disabled={!canSetCover}
        onClick={() => {
          onToggleCover();
          menuHandler.close();
        }}
      >
        {isCover ? translate({ key: 'gallery.removeCover' }) : translate({ key: 'gallery.markAsCover' })}
      </button>

      <button
        className={`rounded-lg border border-container1-border bg-container2 px-3 py-2 text-left text-sm text-title hover:bg-container2-hover`}
        onClick={() => {
          onToggleExtra();
          menuHandler.close();
        }}
      >
        {isExtra ? translate({ key: 'gallery.removeExtra' }) : translate({ key: 'gallery.markAsExtra' })}
      </button>

      <button
        className={`rounded-lg border border-container1-border bg-container2 px-3 py-2 text-left text-sm text-title hover:bg-container2-hover`}
        onClick={() => {
          onReplace();
          menuHandler.close();
        }}
      >
        {translate({ key: 'gallery.replace' })}
      </button>

      <button
        className={`rounded-lg border border-wrong bg-wrong/20 px-3 py-2 text-left text-sm text-title hover:bg-wrong/30`}
        onClick={() => {
          onDelete();
          menuHandler.close();
        }}
      >
        {translate({ key: 'gallery.delete' })}
      </button>
    </div>
  );
}

export default function UploadPage() {
  const translate = useTranslator();
  const navigate = useNavigate();

  const [albums, setAlbums] = useState<GalleryAlbumDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedFolder, setSelectedFolder] = useState('');
  const [newAlbumName, setNewAlbumName] = useState('');
  const [newAlbumTheme, setNewAlbumTheme] = useState('default');
  const [replaceForFile, setReplaceForFile] = useState('');
  const [markUploadAsExtra, setMarkUploadAsExtra] = useState(false);

  const [albumTitle, setAlbumTitle] = useState('');
  const [albumTheme, setAlbumTheme] = useState('default');
  const [albumHidden, setAlbumHidden] = useState(false);
  const [coverFiles, setCoverFiles] = useState<string[]>([]);
  const [extraFiles, setExtraFiles] = useState<string[]>([]);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
  const [reorderMode, setReorderMode] = useState(false);
  const [mediaOrder, setMediaOrder] = useState<string[]>([]);
  const [draggingFile, setDraggingFile] = useState<string | null>(null);
  const [lightboxItems, setLightboxItems] = useState<GalleryMediaItem[]>([]);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const replaceInputRef = useRef<HTMLInputElement | null>(null);

  const loadAlbums = async () => {
    setLoading(true);
    const response = await fetchAdminAlbums();
    setAlbums(response);
    if (!selectedFolder && response.length > 0) {
      setSelectedFolder(response[0].folder);
    }
    setLoading(false);
  };

  useEffect(() => {
    void loadAlbums();
  }, []);

  const selectedAlbum = useMemo(() => albums.find((album) => album.folder === selectedFolder) ?? null, [albums, selectedFolder]);

  useEffect(() => {
    if (!selectedAlbum) return;
    setAlbumTitle(selectedAlbum.title);
    setAlbumTheme(selectedAlbum.theme);
    setAlbumHidden(selectedAlbum.hidden);
    setCoverFiles(selectedAlbum.coverFiles ?? []);
    setExtraFiles(selectedAlbum.extraFiles ?? []);
    setMediaOrder(selectedAlbum.media.map((item) => item.fileName));
    setSelectedFiles([]);
    setSelectionMode(false);
    setReorderMode(false);
  }, [selectedAlbum]);

  const orderedMedia = useMemo(() => {
    if (!selectedAlbum) return [];

    const mediaMap = new Map(selectedAlbum.media.map((item) => [item.fileName, item]));
    const orderedItems = mediaOrder.map((fileName) => mediaMap.get(fileName)).filter((item): item is NonNullable<typeof item> => Boolean(item));
    const missingItems = selectedAlbum.media.filter((item) => !mediaOrder.includes(item.fileName));

    return [...orderedItems, ...missingItems];
  }, [selectedAlbum, mediaOrder]);

  const selectedMedia = useMemo(() => {
    return orderedMedia.filter((item) => selectedFiles.includes(item.fileName));
  }, [orderedMedia, selectedFiles]);

  const lightboxMediaItems = useMemo(() => {
    if (!selectedAlbum) return [] as GalleryMediaItem[];

    return orderedMedia.map((item) => ({
      ...item,
      folder: selectedAlbum.folder,
      title: selectedAlbum.title,
    }));
  }, [orderedMedia, selectedAlbum]);

  const selectedNonVideoMedia = useMemo(() => {
    return selectedMedia.filter((item) => item.kind !== 'video');
  }, [selectedMedia]);

  const remainingCoverSlots = useMemo(() => {
    return Math.max(0, 4 - coverFiles.length);
  }, [coverFiles]);

  const allSelectedMarkedExtra = useMemo(() => {
    if (selectedFiles.length === 0) return false;
    return selectedFiles.every((fileName) => extraFiles.includes(fileName));
  }, [selectedFiles, extraFiles]);

  const allSelectedNonVideoMarkedCover = useMemo(() => {
    if (selectedNonVideoMedia.length === 0) return false;
    return selectedNonVideoMedia.every((item) => coverFiles.includes(item.fileName));
  }, [selectedNonVideoMedia, coverFiles]);

  const selectedNonVideoNotCovered = useMemo(() => {
    return selectedNonVideoMedia.filter((item) => !coverFiles.includes(item.fileName));
  }, [selectedNonVideoMedia, coverFiles]);

  const canAddCoverToSelection = useMemo(() => {
    return selectedNonVideoNotCovered.length > 0 && remainingCoverSlots > 0;
  }, [selectedNonVideoNotCovered, remainingCoverSlots]);

  const handleNewAlbum = async () => {
    if (!newAlbumName.trim()) {
      notify.error({ key: 'gallery.albumNameRequired' });
      return;
    }

    const result = await createAlbumRequest({
      albumName: newAlbumName,
      theme: newAlbumTheme,
    });

    if ('status' in result && result.status === 'success') {
      notify.success({ key: 'gallery.saved' });
      setNewAlbumName('');
      await loadAlbums();
      setSelectedFolder(result.folder);
      return;
    }

    notify.error({ key: 'gallery.saveFailed' });
  };

  const handleUpdateAlbum = async () => {
    if (!selectedAlbum) return;

    const result = await updateAlbumRequest({
      folder: selectedAlbum.folder,
      title: albumTitle,
      hidden: albumHidden,
      theme: albumTheme,
      coverFiles,
      extraFiles,
    });

    if ('status' in result && result.status === 'success') {
      notify.success({ key: 'gallery.saved' });
      await loadAlbums();
      setSelectedFolder(result.folder);
      return;
    }

    notify.error({ key: 'gallery.saveFailed' });
  };

  const handleDeleteAlbum = async () => {
    if (!selectedAlbum) return;
    const confirmed = await confirmDialog({
      title: translate({ key: 'gallery.deleteAlbum' }),
      content: translate({ key: 'gallery.deleteAlbumConfirm' }),
      input: selectedAlbum.folder,
    });
    if (!confirmed) return;

    const result = await deleteAlbumRequest(selectedAlbum.folder);
    if ('status' in result && result.status === 'success') {
      notify.success({ key: 'gallery.saved' });
      await loadAlbums();
      setSelectedFolder('');
      return;
    }
    notify.error({ key: 'gallery.saveFailed' });
  };

  const runUpload = async ({ files, replaceTarget }: { files: File[]; replaceTarget?: string }) => {
    if (!selectedAlbum) return;
    if (files.length === 0) return;

    const totalFiles = files.length;
    let lastProgressUploaded = 0;

    const response = await uploadFilesRequest({
      folder: selectedAlbum.folder,
      files,
      replaceTarget,
      markAsExtra: markUploadAsExtra,
      onBatchProgress: async (progress) => {
        if (progress.uploadedCount !== lastProgressUploaded) {
          notify.info({
            key: 'gallery.uploadProgress',
            params: [
              { key: 'uploaded', value: progress.uploadedCount },
              { key: 'total', value: totalFiles },
            ],
          });
          lastProgressUploaded = progress.uploadedCount;
        }

        await loadAlbums();
        setSelectedFolder(selectedAlbum.folder);
      },
    });

    if ('status' in response && response.status === 'success') {
      if (response.uploaded.length > 0) {
        notify.success({ key: 'gallery.uploadSuccess', params: [{ key: 'count', value: response.uploaded.length }] });
      }

      if (response.failed.length > 0) {
        const message = response.failed.map((item: { fileName: string; reason: string }) => `${item.fileName}: ${item.reason}`).join(', ');
        notify.error({ key: message });
      }

      await loadAlbums();
      setSelectedFolder(selectedAlbum.folder);
      return;
    }

    notify.error({ key: 'gallery.uploadFailed' });
  };

  const onInputUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files ? Array.from(event.target.files) : [];
    await runUpload({ files });
    event.target.value = '';
  };

  const onReplaceUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files ? Array.from(event.target.files) : [];
    if (!replaceForFile) return;
    await runUpload({ files, replaceTarget: replaceForFile });
    setReplaceForFile('');
    event.target.value = '';
  };

  const onDropUpload = async (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();

    if (reorderMode && (draggingFile || event.dataTransfer.types.includes('text/album-reorder'))) {
      setDraggingFile(null);
      return;
    }

    const files = Array.from(event.dataTransfer.files);
    await runUpload({ files });
  };

  const toggleCoverFile = (fileName: string) => {
    if (!selectedAlbum) return;

    let nextCoverFiles = coverFiles;

    if (coverFiles.includes(fileName)) {
      nextCoverFiles = coverFiles.filter((item) => item !== fileName);
    } else {
      if (coverFiles.length >= 4) {
        notify.error({ key: 'gallery.coverLimitReached' });
        return;
      }

      nextCoverFiles = [...coverFiles, fileName];
    }

    setCoverFiles(nextCoverFiles);

    void updateAlbumRequest({
      folder: selectedAlbum.folder,
      coverFiles: nextCoverFiles,
      extraFiles,
    }).then((result) => {
      if (!('status' in result && result.status === 'success')) {
        notify.error({ key: 'gallery.saveFailed' });
      }
    });
  };

  const toggleExtraFile = (fileName: string) => {
    if (!selectedAlbum) return;

    const nextExtraFiles = extraFiles.includes(fileName)
      ? extraFiles.filter((item) => item !== fileName)
      : [...extraFiles, fileName];

    setExtraFiles(nextExtraFiles);

    void updateAlbumRequest({
      folder: selectedAlbum.folder,
      coverFiles,
      extraFiles: nextExtraFiles,
    }).then((result) => {
      if (!('status' in result && result.status === 'success')) {
        notify.error({ key: 'gallery.saveFailed' });
      }
    });
  };

  const toggleSelectedFile = (fileName: string) => {
    setSelectedFiles((current) => {
      if (current.includes(fileName)) {
        return current.filter((item) => item !== fileName);
      }

      return [...current, fileName];
    });
  };

  const handleSelectAll = () => {
    if (!selectedAlbum) return;

    if (selectedFiles.length === orderedMedia.length) {
      setSelectedFiles([]);
      return;
    }

    setSelectedFiles(orderedMedia.map((item) => item.fileName));
  };

  const handleDeleteSelected = async () => {
    if (!selectedAlbum) return;
    if (selectedFiles.length === 0) return;

    const confirmed = await confirmDialog({
      title: translate({ key: 'gallery.deleteSelected' }),
      content: translate({ key: 'gallery.deleteSelectedConfirm', params: [{ key: 'count', value: selectedFiles.length }] }),
    });

    if (!confirmed) return;

    const result = await deleteFilesRequest({
      folder: selectedAlbum.folder,
      fileNames: selectedFiles,
    });

    if ('status' in result && result.status === 'success') {
      notify.success({ key: 'gallery.saved' });
      setSelectedFiles([]);
      await loadAlbums();
      setSelectedFolder(selectedAlbum.folder);
      return;
    }

    notify.error({ key: 'gallery.saveFailed' });
  };

  const handleToggleSelectedExtra = () => {
    if (selectedFiles.length === 0) return;

    if (!selectedAlbum) return;

    const nextExtraFiles = allSelectedMarkedExtra
      ? extraFiles.filter((fileName) => !selectedFiles.includes(fileName))
      : Array.from(new Set([...extraFiles, ...selectedFiles]));

    setExtraFiles(nextExtraFiles);

    void updateAlbumRequest({
      folder: selectedAlbum.folder,
      coverFiles,
      extraFiles: nextExtraFiles,
    }).then((result) => {
      if (!('status' in result && result.status === 'success')) {
        notify.error({ key: 'gallery.saveFailed' });
      }
    });
  };

  const handleToggleSelectedCover = () => {
    if (selectedNonVideoMedia.length === 0) return;

    if (!selectedAlbum) return;

    let nextCoverFiles = coverFiles;

    if (allSelectedNonVideoMarkedCover) {
      const selectedNames = selectedNonVideoMedia.map((item) => item.fileName);
      nextCoverFiles = coverFiles.filter((fileName) => !selectedNames.includes(fileName));
    } else {
      if (!canAddCoverToSelection) {
        notify.error({ key: 'gallery.coverLimitReached' });
        return;
      }

      const toAdd = selectedNonVideoNotCovered.slice(0, remainingCoverSlots).map((item) => item.fileName);
      nextCoverFiles = Array.from(new Set([...coverFiles, ...toAdd]));

      if (selectedNonVideoNotCovered.length > remainingCoverSlots) {
        notify.error({ key: 'gallery.coverLimitReached' });
      }
    }

    setCoverFiles(nextCoverFiles);

    void updateAlbumRequest({
      folder: selectedAlbum.folder,
      coverFiles: nextCoverFiles,
      extraFiles,
    }).then((result) => {
      if (!('status' in result && result.status === 'success')) {
        notify.error({ key: 'gallery.saveFailed' });
      }
    });
  };

  const moveMedia = (dragged: string, target: string) => {
    if (dragged === target) return;

    setMediaOrder((current) => {
      const next = [...current];
      const draggedIndex = next.indexOf(dragged);
      const targetIndex = next.indexOf(target);
      if (draggedIndex < 0 || targetIndex < 0) return current;

      next.splice(draggedIndex, 1);
      next.splice(targetIndex, 0, dragged);
      return next;
    });
  };

  const saveMediaOrder = async () => {
    if (!selectedAlbum) return;
    const result = await reorderAlbumRequest({ folder: selectedAlbum.folder, order: mediaOrder });

    if ('status' in result && result.status === 'success') {
      notify.success({ key: 'gallery.saved' });
      setReorderMode(false);
      await loadAlbums();
      setSelectedFolder(selectedAlbum.folder);
      return;
    }

    notify.error({ key: 'gallery.saveFailed' });
  };

  const handleDeleteMedia = async (fileName: string) => {
    if (!selectedAlbum) return;

    const confirmed = await confirmDialog({
      title: translate({ key: 'gallery.delete' }),
      content: fileName,
    });

    if (!confirmed) return;

    const result = await deleteFilesRequest({
      folder: selectedAlbum.folder,
      fileNames: [fileName],
    });

    if ('status' in result && result.status === 'success') {
      notify.success({ key: 'gallery.saved' });
      await loadAlbums();
      setSelectedFolder(selectedAlbum.folder);
      return;
    }

    notify.error({ key: 'gallery.saveFailed' });
  };

  const openMediaOptionsMenu = (fileName: string, mediaKind: 'image' | 'gif' | 'video') => {
    const canSetCover = mediaKind !== 'video';
    const isCover = coverFiles.includes(fileName);
    const isExtra = extraFiles.includes(fileName);

    void menuHandler.open(
      <MediaOptionsMenu
        canSetCover={canSetCover}
        isCover={isCover}
        isExtra={isExtra}
        onToggleCover={() => toggleCoverFile(fileName)}
        onToggleExtra={() => toggleExtraFile(fileName)}
        onReplace={() => {
          setReplaceForFile(fileName);
          replaceInputRef.current?.click();
        }}
        onDelete={() => {
          void handleDeleteMedia(fileName);
        }}
      />,
      { dimBackground: true, background: 'bg-container1', size: 'sm' }
    );
  };

  return (
    <div className={`h-safe w-full overflow-y-auto bg-background text-title`}>
      <div className={`mx-auto flex w-full max-w-[95rem] flex-col gap-3 p-3 xl:flex-row`}>
        <div className={`flex w-full flex-col gap-2 rounded-2xl border border-primary/40 bg-container1 p-3 xl:w-80`}>
          <div className={`flex items-center justify-between`}>
            <div className={`text-lg font-semibold`}>{translate({ key: 'gallery.uploadTitle' })}</div>
            <button className={`rounded-xl border border-primary-border bg-primary px-3 py-1 text-sm text-title-primary hover:bg-primary-hover`} onClick={() => void navigate('/dashboard')}>
              {translate({ key: 'gallery.backToDashboard' })}
            </button>
          </div>

          <div className={`flex flex-col gap-2 rounded-2xl border border-container1-border bg-container2 p-3`}>
            <div className={`text-sm font-semibold text-title`}>{translate({ key: 'gallery.createAlbum' })}</div>
            <label className={`text-xs font-semibold uppercase tracking-wide text-common`}>{translate({ key: 'gallery.albumTitle' })}</label>
            <input
              className={`min-h-12 rounded-xl border border-container1-border bg-container1 px-4 py-3 text-base text-title outline-none focus:border-primary`}
              value={newAlbumName}
              onChange={(event) => setNewAlbumName(event.target.value)}
              placeholder={translate({ key: 'gallery.albumTitle' })}
            />
            <label className={`text-xs font-semibold uppercase tracking-wide text-common`}>{translate({ key: 'gallery.theme' })}</label>
            <Dropdown
              items={THEMES}
              value={newAlbumTheme}
              onChange={(value) => setNewAlbumTheme(String(value))}
              className={`min-h-12 rounded-xl bg-container1 px-3 py-3 text-base`}
            />
            <button className={`min-h-12 rounded-xl border border-primary-border bg-primary px-4 py-3 text-base font-semibold text-title-primary hover:bg-primary-hover`} onClick={() => void handleNewAlbum()}>
              {translate({ key: 'gallery.create' })}
            </button>
          </div>

          <div className={`flex max-h-[55vh] flex-col gap-2 overflow-y-auto`}>
            {loading && <div className={`text-sm text-common`}>{translate({ key: 'gallery.loading' })}</div>}
            {!loading && albums.map((album) => (
              <button
                key={album.folder}
                className={`flex flex-col gap-1 rounded-xl border p-3 text-left transition ${selectedFolder === album.folder ? 'border-primary-border bg-primary text-title-primary' : `border-container1-border bg-container2 text-title hover:border-primary/50 ${getAlbumThemeClasses(album.theme)}`}`}
                onClick={() => setSelectedFolder(album.folder)}
              >
                <div className={`line-clamp-1 text-base font-semibold`}>{album.title}</div>
                <div className={`text-sm ${selectedFolder === album.folder ? 'text-common-primary' : 'text-common'}`}>{album.folder}</div>
                <div className={`text-sm ${selectedFolder === album.folder ? 'text-common-primary' : 'text-common'}`}>{album.imageCount}</div>
              </button>
            ))}
          </div>
        </div>

        <div className={`flex min-w-0 flex-1 flex-col gap-3`}>
          {!selectedAlbum && (
            <div className={`rounded-xl border border-container1-border bg-container1 p-4 text-common`}>
              {translate({ key: 'gallery.selectAlbum' })}
            </div>
          )}

          {selectedAlbum && (
            <>
              <div className={`flex flex-col gap-2 rounded-xl border border-container1-border bg-container1 p-3`}>
                <div className={`text-sm font-semibold`}>{translate({ key: 'gallery.albumSettings' })}</div>
                <div className={`grid grid-cols-1 gap-2 md:grid-cols-2`}>
                  <div className={`flex flex-col gap-1`}>
                    <label className={`text-xs font-semibold uppercase tracking-wide text-common`}>{translate({ key: 'gallery.albumTitle' })}</label>
                    <input className={`min-h-11 rounded-xl border border-container1-border bg-container2 px-4 py-3 text-sm text-title outline-none focus:border-primary`} value={albumTitle} onChange={(event) => setAlbumTitle(event.target.value)} />
                  </div>
                  <div className={`flex flex-col gap-1`}>
                    <label className={`text-xs font-semibold uppercase tracking-wide text-common`}>{translate({ key: 'gallery.theme' })}</label>
                    <Dropdown
                      items={THEMES}
                      value={albumTheme}
                      onChange={(value) => setAlbumTheme(String(value))}
                      className={`min-h-11 rounded-xl bg-container2 px-3 py-3`}
                    />
                  </div>
                  <label className={`flex min-h-11 items-center gap-2 rounded-xl border border-container1-border bg-container2 px-4 py-3 text-sm text-title`}>
                    <input className={`h-4 w-4 accent-primary`} type="checkbox" checked={albumHidden} onChange={(event) => setAlbumHidden(event.target.checked)} />
                    {translate({ key: 'gallery.hideAlbum' })}
                  </label>
                </div>
                <div className={`flex flex-wrap gap-2`}>
                  <button className={`rounded-xl border border-primary-border bg-primary px-3 py-2 text-sm font-semibold text-title-primary hover:bg-primary-hover`} onClick={() => void handleUpdateAlbum()}>
                    {translate({ key: 'gallery.save' })}
                  </button>
                  <button className={`rounded-xl border border-wrong bg-wrong/20 px-3 py-2 text-sm text-title hover:bg-wrong/30`} onClick={() => void handleDeleteAlbum()}>
                    {translate({ key: 'gallery.deleteAlbum' })}
                  </button>
                </div>
              </div>

              <div
                className={`flex min-h-[26rem] flex-col gap-3 rounded-2xl border border-dashed border-primary/40 bg-container1 p-3`}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  void onDropUpload(event);
                }}
              >
                <div className={`flex items-center justify-between`}>
                  <div className={`text-sm font-semibold text-title`}>{translate({ key: 'gallery.media' })}</div>
                  <div className={`flex flex-wrap items-center justify-end gap-2`}>
                    <button
                      className={`rounded-xl border px-3 py-2 text-sm ${selectionMode ? 'border-primary-border bg-primary text-title-primary' : 'border-container1-border bg-container2 text-title hover:bg-container2-hover'}`}
                      onClick={() => {
                        setSelectionMode((current) => {
                          const next = !current;
                          if (next) setReorderMode(false);
                          return next;
                        });
                        setSelectedFiles([]);
                      }}
                    >
                      {selectionMode ? translate({ key: 'gallery.cancelSelect' }) : translate({ key: 'gallery.selectTool' })}
                    </button>
                    <button
                      className={`rounded-xl border px-3 py-2 text-sm ${reorderMode ? 'border-primary-border bg-primary text-title-primary' : 'border-container1-border bg-container2 text-title hover:bg-container2-hover'}`}
                      onClick={() => setReorderMode((current) => {
                        const next = !current;
                        if (next) {
                          setSelectionMode(false);
                          setSelectedFiles([]);
                        }
                        return next;
                      })}
                    >
                      {reorderMode ? translate({ key: 'gallery.doneReorder' }) : translate({ key: 'gallery.reorderTool' })}
                    </button>

                    {!selectionMode && !reorderMode && (
                      <>
                        <label className={`flex min-h-10 items-center gap-2 rounded-xl border border-container1-border bg-container2 px-3 py-2 text-xs text-common`}>
                          <input className={`h-4 w-4 accent-primary`} type="checkbox" checked={markUploadAsExtra} onChange={(event) => setMarkUploadAsExtra(event.target.checked)} />
                          {translate({ key: 'gallery.uploadAsExtra' })}
                        </label>
                        <button className={`rounded-xl border border-container1-border bg-container2 px-3 py-2 text-sm text-title hover:bg-container2-hover`} onClick={() => fileInputRef.current?.click()}>
                          {translate({ key: 'gallery.selectFiles' })}
                        </button>
                      </>
                    )}

                    {reorderMode && (
                      <button className={`rounded-xl border border-primary-border bg-primary px-3 py-2 text-sm font-semibold text-title-primary hover:bg-primary-hover`} onClick={() => void saveMediaOrder()}>
                        {translate({ key: 'gallery.saveOrder' })}
                      </button>
                    )}
                    {selectionMode && (
                      <>
                        <div className={`rounded-xl border border-container1-border bg-container2 px-3 py-2 text-xs text-common`}>
                          {translate({ key: 'gallery.selectedCount', params: [{ key: 'count', value: selectedFiles.length }] })}
                        </div>
                        <button className={`rounded-xl border border-container1-border bg-container2 px-3 py-2 text-sm text-title hover:bg-container2-hover`} onClick={handleSelectAll}>
                          {selectedFiles.length === orderedMedia.length ? translate({ key: 'gallery.clearSelection' }) : translate({ key: 'gallery.selectAll' })}
                        </button>
                        <button
                          className={`rounded-xl border border-container1-border bg-container2 px-3 py-2 text-sm text-title hover:bg-container2-hover ${selectedNonVideoMedia.length === 0 || (!allSelectedNonVideoMarkedCover && !canAddCoverToSelection) ? 'opacity-50' : ''}`}
                          onClick={handleToggleSelectedCover}
                          disabled={selectedNonVideoMedia.length === 0 || (!allSelectedNonVideoMarkedCover && !canAddCoverToSelection)}
                        >
                          {allSelectedNonVideoMarkedCover ? translate({ key: 'gallery.removeCover' }) : translate({ key: 'gallery.markAsCover' })}
                        </button>
                        <button
                          className={`rounded-xl border border-container1-border bg-container2 px-3 py-2 text-sm text-title hover:bg-container2-hover ${selectedFiles.length === 0 ? 'opacity-50' : ''}`}
                          onClick={handleToggleSelectedExtra}
                          disabled={selectedFiles.length === 0}
                        >
                          {allSelectedMarkedExtra ? translate({ key: 'gallery.removeExtra' }) : translate({ key: 'gallery.markAsExtra' })}
                        </button>
                        <button className={`rounded-xl border border-wrong bg-wrong/20 px-3 py-2 text-sm text-title hover:bg-wrong/30`} onClick={() => void handleDeleteSelected()}>
                          {translate({ key: 'gallery.deleteSelected' })}
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {selectedAlbum.media.length === 0 && (
                  <button
                    className={`flex min-h-[18rem] w-full items-center justify-center rounded-xl border border-container1-border bg-container2 text-sm text-common hover:bg-container2-hover`}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    {translate({ key: 'gallery.dropzone' })}
                  </button>
                )}

                {selectedAlbum.media.length > 0 && (
                  <div className={`grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-4`}>
                    {orderedMedia.map((media) => (
                      <div
                        key={media.fileName}
                        draggable={reorderMode}
                        onDragStart={(event) => {
                          if (!reorderMode) return;
                          event.dataTransfer.setData('text/album-reorder', media.fileName);
                          event.dataTransfer.effectAllowed = 'move';
                          setDraggingFile(media.fileName);
                        }}
                        onDragEnd={() => setDraggingFile(null)}
                        onDragOver={(event) => {
                          if (!reorderMode) return;
                          event.preventDefault();
                          event.stopPropagation();
                        }}
                        onDrop={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          if (!reorderMode || !draggingFile) return;
                          moveMedia(draggingFile, media.fileName);
                          setDraggingFile(null);
                        }}
                        onClick={() => {
                          if (selectionMode) {
                            toggleSelectedFile(media.fileName);
                            return;
                          }

                          if (reorderMode) return;

                          const index = lightboxMediaItems.findIndex((item) => item.fileName === media.fileName);
                          if (index < 0) return;
                          setLightboxItems(lightboxMediaItems);
                          setLightboxIndex(index);
                        }}
                        className={`flex flex-col gap-2 overflow-hidden rounded-xl border bg-container2 p-2 ${selectionMode && selectedFiles.includes(media.fileName) ? 'border-primary-border ring-2 ring-primary/50' : 'border-container1-border'} ${reorderMode ? 'cursor-move' : ''}`}
                      >
                        <div className={`h-32 overflow-hidden rounded-lg border border-container1-border`}>
                          <ProgressiveMedia media={media} alt={media.fileName} className={`h-full w-full`} />
                        </div>
                        <div className={`line-clamp-1 text-xs text-common`}>{media.fileName}</div>
                        <div className={`flex items-center justify-between gap-2`}>
                          <div className={`flex gap-1`}>
                            {coverFiles.includes(media.fileName) && (
                              <div className={`rounded-md border border-correct bg-correct/20 px-2 py-1 text-[10px] text-title`}>{translate({ key: 'gallery.cover' })}</div>
                            )}
                            {extraFiles.includes(media.fileName) && (
                              <div className={`rounded-md border border-primary-border bg-primary/20 px-2 py-1 text-[10px] text-title`}>{translate({ key: 'gallery.extra' })}</div>
                            )}
                          </div>
                          <button
                            className={`rounded-md border border-container1-border bg-container1 px-2 py-1 text-xs text-common hover:bg-container1-hover`}
                            onClick={(event) => {
                              event.stopPropagation();
                              openMediaOptionsMenu(media.fileName, media.kind);
                            }}
                            disabled={selectionMode}
                          >
                            <FontAwesomeIcon icon={faEllipsisVertical} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <input ref={fileInputRef} type="file" multiple className={`hidden`} onChange={(event) => { void onInputUpload(event); }} />
                <input ref={replaceInputRef} type="file" className={`hidden`} onChange={(event) => { void onReplaceUpload(event); }} />
              </div>
            </>
          )}
        </div>
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
