import tryCatch from 'shared/tryCatch';
import { apiRequest } from 'src/_sockets/apiRequest';

export interface GalleryMediaItem {
  fileName: string;
  kind: 'image' | 'gif' | 'video';
  originalUrl: string;
  lowQualityUrl?: string;
  thumbUrl?: string;
  modifiedAt: number;
  isExtra: boolean;
  folder?: string;
  title?: string;
}

export interface GalleryAlbumCard {
  folder: string;
  title: string;
  theme: string;
  imageCount: number;
  updatedAt: number;
  coverUrls: string[];
  coverCount: number;
}

export interface GalleryAlbumDetail {
  folder: string;
  title: string;
  hidden: boolean;
  theme: string;
  thumbnailFile: string | null;
  coverFiles: string[];
  extraFiles: string[];
  imageCount: number;
  updatedAt: number;
  media: GalleryMediaItem[];
}

export interface DashboardPayload {
  albums: GalleryAlbumCard[];
  carousels: GalleryMediaItem[][];
}

interface ApiError {
  status: 'error';
  message: string;
}

interface ApiSuccess<T> {
  status: 'success';
  result: T;
}

const requestApi = async <T>({
  name,
  data,
}: {
  name: string;
  data?: Record<string, unknown>;
}): Promise<T | ApiError> => {
  const [requestError, response] = await tryCatch(() => {
    return (apiRequest as any)({
      name,
      version: 'v1',
      data: data ?? {},
    }) as Promise<T | ApiError>;
  });

  if (requestError || !response) {
    return { status: 'error', message: 'gallery.networkError' };
  }

  return response;
};

export const fetchDashboardData = async (): Promise<DashboardPayload | null> => {
  const data = await requestApi<ApiSuccess<DashboardPayload> | ApiError>({
    name: 'dashboard/getDashboard',
  });

  if ('status' in data && data.status === 'success') return data.result;
  return null;
};

export const fetchAlbum = async ({ folder, includeHidden }: { folder: string; includeHidden?: boolean }): Promise<GalleryAlbumDetail | null> => {
  const data = await requestApi<ApiSuccess<GalleryAlbumDetail> | ApiError>({
    name: 'dashboard/getAlbum',
    data: {
      folder,
      includeHidden,
    },
  });

  if ('status' in data && data.status === 'success') return data.result;
  return null;
};

export const fetchAdminAlbums = async (): Promise<GalleryAlbumDetail[]> => {
  const data = await requestApi<ApiSuccess<GalleryAlbumDetail[]> | ApiError>({
    name: 'upload/getAlbums',
    data: {
      includeHidden: true,
    },
  });

  if ('status' in data && data.status === 'success') return data.result;
  return [];
};

export const createAlbumRequest = async ({ albumName, theme }: { albumName: string; theme: string }) => {
  return requestApi<{ status: 'success'; folder: string } | ApiError>({
    name: 'upload/createAlbum',
    data: { albumName, theme },
  });
};

export const updateAlbumRequest = async ({
  folder,
  title,
  hidden,
  theme,
  thumbnailFile,
  coverFiles,
  extraFiles,
  renameFolder,
}: {
  folder: string;
  title?: string;
  hidden?: boolean;
  theme?: string;
  thumbnailFile?: string | null;
  coverFiles?: string[];
  extraFiles?: string[];
  renameFolder?: string;
}) => {
  return requestApi<{ status: 'success'; folder: string } | ApiError>({
    name: 'upload/updateAlbum',
    data: { folder, title, hidden, theme, thumbnailFile, coverFiles, extraFiles, renameFolder },
  });
};

export const deleteAlbumRequest = async (folder: string) => {
  return requestApi<{ status: 'success'; ok: boolean } | ApiError>({
    name: 'upload/deleteAlbum',
    data: { folder },
  });
};

export const reorderAlbumRequest = async ({ folder, order }: { folder: string; order: string[] }) => {
  return requestApi<{ status: 'success'; order: string[] } | ApiError>({
    name: 'upload/reorderAlbum',
    data: { folder, order },
  });
};

export const deleteFilesRequest = async ({ folder, fileNames }: { folder: string; fileNames: string[] }) => {
  return requestApi<{ status: 'success'; deleted: string[] } | ApiError>({
    name: 'upload/deleteFiles',
    data: { folder, fileNames },
  });
};

const MAX_UPLOAD_BATCH_BYTES = 32 * 1024 * 1024;
const MAX_UPLOAD_BATCH_FILES = 5;
const MAX_CONCURRENT_BATCH_UPLOADS = 2;

type UploadFilesSuccess = {
  status: 'success';
  uploaded: string[];
  failed: { fileName: string; reason: string }[];
};

type UploadFilesError = {
  status: 'error';
  message: 'upload.invalidResponse' | 'upload.networkError';
};

type UploadBatchProgress = {
  batchIndex: number;
  totalBatches: number;
  batchUploaded: number;
  batchFailed: number;
  uploadedCount: number;
  failedCount: number;
  totalCount: number;
};

const uploadBatchWithFormData = async ({
  folder,
  replaceTarget,
  markAsExtra,
  batch,
}: {
  folder: string;
  replaceTarget?: string;
  markAsExtra?: boolean;
  batch: File[];
}): Promise<{ status: 'success'; uploaded: string[]; failed: { fileName: string; reason: string }[] } | UploadFilesError> => {
  const formData = new FormData();
  formData.append('folder', folder);
  if (replaceTarget) formData.append('replaceTarget', replaceTarget);
  formData.append('markAsExtra', markAsExtra ? 'true' : 'false');

  for (const file of batch) {
    formData.append('files', file, file.name);
  }

  const [requestError, response] = await tryCatch(() => fetch('http://localhost:80/api/upload/uploadFiles/v1', {
    method: 'POST',
    body: formData,
    credentials: 'include',
  }));

  if (requestError || !response) {
    return { status: 'error', message: 'upload.networkError' };
  }

  const [jsonError, payload] = await tryCatch(() => response.json() as Promise<{ status?: string; uploaded?: string[]; failed?: { fileName: string; reason: string }[] }>);
  if (jsonError || !payload || payload.status !== 'success') {
    return { status: 'error', message: 'upload.networkError' };
  }

  return {
    status: 'success',
    uploaded: Array.isArray(payload.uploaded) ? payload.uploaded : [],
    failed: Array.isArray(payload.failed) ? payload.failed : [],
  };
};

export const uploadFilesRequest = async ({
  folder,
  files,
  replaceTarget,
  markAsExtra,
  onBatchProgress,
}: {
  folder: string;
  files: File[];
  replaceTarget?: string;
  markAsExtra?: boolean;
  onBatchProgress?: (progress: UploadBatchProgress) => Promise<void> | void;
}): Promise<UploadFilesSuccess | UploadFilesError> => {
  const uploaded: string[] = [];
  const failed: { fileName: string; reason: string }[] = [];

  const batches = [] as File[][];
  let currentBatch = [] as File[];
  let currentBatchBytes = 0;

  console.log('Starting file batching...', { fileCount: files.length });

  for (const item of files) {
    const itemBytes = item.size;

    if (itemBytes > MAX_UPLOAD_BATCH_BYTES) {
      if (currentBatch.length > 0) {
        batches.push(currentBatch);
        currentBatch = [];
        currentBatchBytes = 0;
      }

      batches.push([item]);
      continue;
    }

    const exceedsFileCount = currentBatch.length >= MAX_UPLOAD_BATCH_FILES;
    const exceedsByteBudget = (currentBatchBytes + itemBytes) > MAX_UPLOAD_BATCH_BYTES;

    if ((exceedsFileCount || exceedsByteBudget) && currentBatch.length > 0) {
      batches.push(currentBatch);
      currentBatch = [];
      currentBatchBytes = 0;
    }

    currentBatch.push(item);
    currentBatchBytes += itemBytes;
  }

  if (currentBatch.length > 0) {
    batches.push(currentBatch);
  }

  console.log('File batching completed.', { batchCount: batches.length, batches: batches.map(batch => ({ fileCount: batch.length, totalBytes: batch.reduce((sum, file) => sum + file.size, 0) })) });

  const processBatch = async (batch: File[]) => {
    const response = await uploadBatchWithFormData({
      folder,
      replaceTarget,
      markAsExtra,
      batch,
    });

    if (response.status === 'error') {
      return { status: 'error' as const, message: 'upload.networkError' as const };
    }

    return {
      status: 'success' as const,
      uploaded: response.uploaded,
      failed: response.failed,
    };
  };

  for (let windowStart = 0; windowStart < batches.length; windowStart += MAX_CONCURRENT_BATCH_UPLOADS) {
    const windowBatches = batches.slice(windowStart, windowStart + MAX_CONCURRENT_BATCH_UPLOADS);
    const windowResults = await Promise.all(windowBatches.map((batch) => processBatch(batch)));

    for (let offset = 0; offset < windowResults.length; offset++) {
      const result = windowResults[offset];
      if (result.status === 'error') {
        return { status: 'error', message: result.message };
      }

      uploaded.push(...result.uploaded);
      failed.push(...result.failed);

      if (onBatchProgress) {
        await onBatchProgress({
          batchIndex: windowStart + offset + 1,
          totalBatches: batches.length,
          batchUploaded: result.uploaded.length,
          batchFailed: result.failed.length,
          uploadedCount: uploaded.length,
          failedCount: failed.length,
          totalCount: files.length,
        });
      }
    }
  }

  return {
    status: 'success' as const,
    uploaded,
    failed,
  };
};