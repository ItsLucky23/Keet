import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { IncomingMessage } from 'http';
import { prisma } from '../functions/db';
import tryCatch from '../../shared/tryCatch';
import { UPLOADS_DIR } from '../utils/paths';

export const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp']);
export const ANIMATED_EXTENSIONS = new Set(['.gif']);
export const VIDEO_EXTENSIONS = new Set(['.mp4', '.mov', '.webm', '.m4v', '.avi', '.mkv']);
export const ALL_MEDIA_EXTENSIONS = new Set([...IMAGE_EXTENSIONS, ...ANIMATED_EXTENSIONS, ...VIDEO_EXTENSIONS]);

const DERIVED_ROOT = path.join(UPLOADS_DIR, '_derived');
const LOW_QUALITY_DIR = 'low';
const THUMBNAIL_DIR = 'thumb';

export const albumThemes = ['default', 'carnaval', 'koningsdag', 'zomer', 'winter', 'halloween'] as const;
export type AlbumTheme = (typeof albumThemes)[number];

export interface MediaItem {
  fileName: string;
  kind: 'image' | 'gif' | 'video';
  originalUrl: string;
  lowQualityUrl?: string;
  thumbUrl?: string;
  modifiedAt: number;
  isExtra: boolean;
}

export interface AlbumView {
  folder: string;
  title: string;
  hidden: boolean;
  theme: string;
  thumbnailFile: string | null;
  coverFiles: string[];
  imageCount: number;
  createdAt: number;
  updatedAt: number;
  media: MediaItem[];
}

export interface ParsedMultipartFile {
  fieldName: string;
  fileName: string;
  mimeType: string;
  buffer: Buffer;
}

interface ParsedMultipartData {
  fields: Record<string, string>;
  files: ParsedMultipartFile[];
}

const normalizeForUrl = (value: string): string => value.split(path.sep).map(encodeURIComponent).join('/');

const getMimeType = (filePath: string): string => {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.gif') return 'image/gif';
  if (ext === '.mp4') return 'video/mp4';
  if (ext === '.mov') return 'video/quicktime';
  if (ext === '.webm') return 'video/webm';
  if (ext === '.m4v') return 'video/x-m4v';
  if (ext === '.avi') return 'video/x-msvideo';
  if (ext === '.mkv') return 'video/x-matroska';
  return 'application/octet-stream';
};

const exists = async (targetPath: string): Promise<boolean> => {
  const [error] = await tryCatch(fs.promises.access, targetPath);
  return !error;
};

const ensureDirectory = async (dirPath: string): Promise<void> => {
  await fs.promises.mkdir(dirPath, { recursive: true });
};

const sanitizeSegment = (value: string): string => {
  const cleaned = value
    .normalize('NFKC')
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
    .trim();

  return cleaned.toLowerCase();
};

export const isValidAlbumName = (value: string): boolean => {
  if (!value) return false;
  const cleaned = sanitizeSegment(value);
  if (!cleaned) return false;
  if (cleaned.startsWith('_')) return false;
  if (cleaned.length > 80) return false;
  return true;
};

const getFileKind = (fileName: string): 'image' | 'gif' | 'video' | null => {
  const ext = path.extname(fileName).toLowerCase();
  if (IMAGE_EXTENSIONS.has(ext)) return 'image';
  if (ANIMATED_EXTENSIONS.has(ext)) return 'gif';
  if (VIDEO_EXTENSIONS.has(ext)) return 'video';
  return null;
};

const getDerivedBaseName = (fileName: string): string => `${path.parse(fileName).name}.webp`;

const getAlbumDir = (folder: string): string => path.join(UPLOADS_DIR, folder);
const getAlbumDerivedDir = (folder: string): string => path.join(DERIVED_ROOT, folder);

const getPublicUrl = (segments: string[]): string => `/${normalizeForUrl(path.join(...segments))}`;

const sortAlbumsByUpdated = (items: AlbumView[]): AlbumView[] => [...items].sort((a, b) => b.updatedAt - a.updatedAt);

const isHiddenOrPrivatePath = (name: string): boolean => name.startsWith('_');

export const ensureMediaRoots = async (): Promise<void> => {
  await ensureDirectory(UPLOADS_DIR);
  await ensureDirectory(DERIVED_ROOT);
};

const createImageDerivatives = async ({
  sourceBuffer,
  album,
  outputBaseName,
}: {
  sourceBuffer: Buffer;
  album: string;
  outputBaseName: string;
}): Promise<{ lowQualityPath: string; thumbPath: string }> => {
  const lowDir = path.join(getAlbumDerivedDir(album), LOW_QUALITY_DIR);
  const thumbDir = path.join(getAlbumDerivedDir(album), THUMBNAIL_DIR);

  await ensureDirectory(lowDir);
  await ensureDirectory(thumbDir);

  const lowQualityPath = path.join(lowDir, outputBaseName);
  const thumbPath = path.join(thumbDir, outputBaseName);

  const normalized = sharp(sourceBuffer, { failOn: 'none' }).rotate();

  await normalized
    .clone()
    .resize({ width: 72, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 32 })
    .toFile(lowQualityPath);

  await normalized
    .clone()
    .resize({ width: 480, height: 360, fit: 'cover', position: 'attention' })
    .webp({ quality: 66 })
    .toFile(thumbPath);

  return { lowQualityPath, thumbPath };
};

const writeOptimizedImage = async ({
  targetPath,
  buffer,
}: {
  targetPath: string;
  buffer: Buffer;
}): Promise<void> => {
  await sharp(buffer, { failOn: 'none' })
    .rotate()
    .resize({ width: 3200, height: 3200, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 82 })
    .toFile(targetPath);
};

export const parseMultipartRequest = async (req: IncomingMessage): Promise<ParsedMultipartData> => {
  const rawContentType = req.headers['content-type'];
  const contentType = Array.isArray(rawContentType) ? rawContentType[0] : (rawContentType || '');
  const boundaryMatch = contentType.match(/boundary=(.+)$/i);
  const boundary = boundaryMatch?.[1];

  if (!boundary) {
    throw new Error('upload.invalidBoundary');
  }

  const bodyChunks: Buffer[] = [];
  await new Promise<void>((resolve, reject) => {
    req.on('data', (chunk) => {
      bodyChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    req.on('end', () => resolve());
    req.on('error', (error) => reject(error));
  });

  const body = Buffer.concat(bodyChunks);
  const bodyText = body.toString('latin1');
  const parts = bodyText.split(`--${boundary}`);

  const fields: Record<string, string> = {};
  const files: ParsedMultipartFile[] = [];

  for (const part of parts) {
    const cleaned = part.trim();
    if (!cleaned || cleaned === '--') continue;

    const headerEnd = part.indexOf('\r\n\r\n');
    if (headerEnd <= 0) continue;

    const rawHeaders = part.slice(0, headerEnd);
    let rawBody = part.slice(headerEnd + 4);
    if (rawBody.endsWith('\r\n')) rawBody = rawBody.slice(0, -2);

    const contentDisposition = rawHeaders
      .split('\r\n')
      .find((line) => line.toLowerCase().startsWith('content-disposition:'));

    if (!contentDisposition) continue;

    const fieldName = contentDisposition.match(/name="([^"]+)"/i)?.[1];
    if (!fieldName) continue;

    const fileNameRaw = contentDisposition.match(/filename="([^"]*)"/i)?.[1];
    if (!fileNameRaw) {
      fields[fieldName] = rawBody;
      continue;
    }

    const contentTypeLine = rawHeaders
      .split('\r\n')
      .find((line) => line.toLowerCase().startsWith('content-type:'));
    const mimeType = contentTypeLine?.split(':')[1]?.trim() || 'application/octet-stream';

    files.push({
      fieldName,
      fileName: path.basename(fileNameRaw),
      mimeType,
      buffer: Buffer.from(rawBody, 'latin1'),
    });
  }

  return { fields, files };
};

const getAlbumDocument = async (folder: string) => {
  return prisma.album.findUnique({ where: { folder } });
};

const ensureAlbumDocument = async (folder: string) => {
  const existing = await getAlbumDocument(folder);
  if (existing) return existing;
  return prisma.album.create({
    data: {
      folder,
      title: folder,
      theme: 'default',
      hidden: false,
      thumbnailFile: null,
      coverFiles: [],
      extraFiles: [],
      imageOrder: [],
    },
  });
};

export const listAlbumFolders = async (): Promise<string[]> => {
  await ensureMediaRoots();
  const entries = await fs.promises.readdir(UPLOADS_DIR, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory() && !isHiddenOrPrivatePath(entry.name))
    .map((entry) => entry.name)
    .sort((a, b) => b.localeCompare(a));
};

const statSafe = async (targetPath: string): Promise<fs.Stats | null> => {
  const [error, result] = await tryCatch(() => fs.promises.stat(targetPath, { bigint: false }));
  if (error || !result) return null;
  return result;
};

export const listAlbumMedia = async (folder: string): Promise<MediaItem[]> => {
  const albumDir = getAlbumDir(folder);
  if (!(await exists(albumDir))) return [];

  const entries = await fs.promises.readdir(albumDir, { withFileTypes: true });
  const mediaItems: MediaItem[] = [];
  const albumDoc = await ensureAlbumDocument(folder);

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const kind = getFileKind(entry.name);
    if (!kind) continue;

    const originalPath = path.join(albumDir, entry.name);
    const stat = await statSafe(originalPath);
    if (!stat) continue;

    const derivedName = getDerivedBaseName(entry.name);
    const lowQualityPath = path.join(getAlbumDerivedDir(folder), LOW_QUALITY_DIR, derivedName);
    const thumbPath = path.join(getAlbumDerivedDir(folder), THUMBNAIL_DIR, derivedName);

    const lowQualityExists = await exists(lowQualityPath);
    const thumbExists = await exists(thumbPath);

    mediaItems.push({
      fileName: entry.name,
      kind,
      originalUrl: getPublicUrl(['uploads', folder, entry.name]),
      lowQualityUrl: lowQualityExists ? getPublicUrl(['uploads', '_derived', folder, LOW_QUALITY_DIR, derivedName]) : undefined,
      thumbUrl: thumbExists ? getPublicUrl(['uploads', '_derived', folder, THUMBNAIL_DIR, derivedName]) : undefined,
      modifiedAt: stat.mtimeMs,
      isExtra: albumDoc.extraFiles.includes(entry.name),
    });
  }

  const ordered = [...mediaItems].sort((a, b) => {
    const aIndex = albumDoc.imageOrder.indexOf(a.fileName);
    const bIndex = albumDoc.imageOrder.indexOf(b.fileName);
    if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex;
    if (aIndex !== -1) return -1;
    if (bIndex !== -1) return 1;
    return a.modifiedAt - b.modifiedAt;
  });

  return ordered;
};

export const listAlbumsWithMedia = async ({ includeHidden }: { includeHidden: boolean }): Promise<AlbumView[]> => {
  const folders = await listAlbumFolders();
  const albums: AlbumView[] = [];

  for (const folder of folders) {
    const [mediaError, media] = await tryCatch(listAlbumMedia, folder);
    if (mediaError || !media) continue;

    const albumDoc = await ensureAlbumDocument(folder);
    if (!includeHidden && albumDoc.hidden) continue;

    const firstMedia = media[0];
    const thumbnailFile = albumDoc.thumbnailFile && media.some((item) => item.fileName === albumDoc.thumbnailFile)
      ? albumDoc.thumbnailFile
      : (firstMedia?.fileName ?? null);

    const thumbnailMedia = thumbnailFile ? media.find((item) => item.fileName === thumbnailFile) : null;

    albums.push({
      folder,
      title: albumDoc.title,
      hidden: albumDoc.hidden,
      theme: albumDoc.theme,
      thumbnailFile,
      coverFiles: albumDoc.coverFiles.filter((item) => media.some((mediaItem) => mediaItem.fileName === item)).slice(0, 4),
      imageCount: media.length,
      createdAt: albumDoc.createdAt.getTime(),
      updatedAt: albumDoc.updatedAt.getTime(),
      media: media.map((item) => ({
        ...item,
        thumbUrl: item.fileName === thumbnailFile
          ? (item.thumbUrl ?? item.lowQualityUrl ?? item.originalUrl)
          : item.thumbUrl,
      })),
    });

    if (thumbnailMedia && !thumbnailMedia.thumbUrl && thumbnailMedia.kind === 'image') {
      const filePath = path.join(getAlbumDir(folder), thumbnailMedia.fileName);
      const [readError, buffer] = await tryCatch(() => fs.promises.readFile(filePath));
      if (!readError && buffer && Buffer.isBuffer(buffer)) {
        const derivedName = getDerivedBaseName(thumbnailMedia.fileName);
        await createImageDerivatives({ sourceBuffer: buffer, album: folder, outputBaseName: derivedName });
      }
    }
  }

  return sortAlbumsByUpdated(albums.map((album) => ({
    ...album,
    updatedAt: Math.max(album.updatedAt, ...album.media.map((item) => item.modifiedAt), 0),
  })));
};

export const createAlbum = async ({ folder, title, theme }: { folder: string; title?: string; theme?: string }) => {
  const sanitizedFolder = sanitizeSegment(folder);
  if (!isValidAlbumName(sanitizedFolder)) {
    return { status: 'error', message: 'album.invalidName' as const };
  }

  const albumDir = getAlbumDir(sanitizedFolder);
  if (await exists(albumDir)) {
    return { status: 'error', message: 'album.exists' as const };
  }

  await ensureDirectory(albumDir);
  await ensureDirectory(getAlbumDerivedDir(sanitizedFolder));
  await ensureAlbumDocument(sanitizedFolder);

  await prisma.album.update({
    where: { folder: sanitizedFolder },
    data: {
      title: title?.trim() || sanitizedFolder,
      theme: albumThemes.includes((theme || 'default') as AlbumTheme) ? (theme as AlbumTheme) : 'default',
    },
  });

  return { status: 'success', folder: sanitizedFolder as string };
};

const readStaticImageBuffer = async (filePath: string): Promise<Buffer | null> => {
  const [readError, buffer] = await tryCatch(() => fs.promises.readFile(filePath));
  if (readError || !buffer || !Buffer.isBuffer(buffer)) return null;
  return buffer;
};

const removeDerivedFiles = async ({ folder, fileName }: { folder: string; fileName: string }) => {
  const derivedName = getDerivedBaseName(fileName);
  const lowFile = path.join(getAlbumDerivedDir(folder), LOW_QUALITY_DIR, derivedName);
  const thumbFile = path.join(getAlbumDerivedDir(folder), THUMBNAIL_DIR, derivedName);
  await tryCatch(fs.promises.unlink, lowFile);
  await tryCatch(fs.promises.unlink, thumbFile);
};

const syncImageOrder = async (folder: string, validFileNames: string[]) => {
  const albumDoc = await ensureAlbumDocument(folder);
  const nextOrder = albumDoc.imageOrder.filter((fileName) => validFileNames.includes(fileName));
  const nextCoverFiles = albumDoc.coverFiles.filter((fileName) => validFileNames.includes(fileName)).slice(0, 4);
  const nextExtraFiles = albumDoc.extraFiles.filter((fileName) => validFileNames.includes(fileName));
  await prisma.album.update({
    where: { folder },
    data: {
      imageOrder: nextOrder,
      thumbnailFile: albumDoc.thumbnailFile && validFileNames.includes(albumDoc.thumbnailFile)
        ? albumDoc.thumbnailFile
        : null,
      coverFiles: nextCoverFiles,
      extraFiles: nextExtraFiles,
    },
  });
};

const getUploadTargetName = ({ rawName, isImage }: { rawName: string; isImage: boolean }) => {
  const parsed = path.parse(rawName);
  const baseName = sanitizeSegment(parsed.name || 'file');
  if (!baseName) return null;

  if (isImage) return `${baseName}.webp`;

  const extension = parsed.ext.toLowerCase();
  if (!ALL_MEDIA_EXTENSIONS.has(extension)) return null;
  return `${baseName}${extension}`;
};

export const uploadFilesToAlbum = async ({
  album,
  files,
  replaceTarget,
  markAsExtra,
}: {
  album: string;
  files: ParsedMultipartFile[];
  replaceTarget?: string;
  markAsExtra?: boolean;
}) => {
  const sanitizedAlbum = sanitizeSegment(album);
  if (!isValidAlbumName(sanitizedAlbum)) {
    return { status: 'error', message: 'album.invalidName' as const };
  }

  const albumPath = getAlbumDir(sanitizedAlbum);
  if (!(await exists(albumPath))) {
    return { status: 'error', message: 'album.notFound' as const };
  }

  const uploaded: string[] = [];
  const failed: { fileName: string; reason: string }[] = [];

  for (const file of files) {
    const originalExt = path.extname(file.fileName).toLowerCase();
    const imageLike = IMAGE_EXTENSIONS.has(originalExt) || originalExt === '.gif';
    const targetName = replaceTarget
      ? path.basename(replaceTarget)
      : getUploadTargetName({ rawName: file.fileName, isImage: imageLike && originalExt !== '.gif' });

    if (!targetName) {
      failed.push({ fileName: file.fileName, reason: 'upload.unsupportedType' });
      continue;
    }

    const targetPath = path.join(albumPath, targetName);
    const targetExists = await exists(targetPath);
    if (!replaceTarget && targetExists) {
      failed.push({ fileName: file.fileName, reason: 'upload.duplicateName' });
      continue;
    }

    if (replaceTarget && !targetExists) {
      failed.push({ fileName: file.fileName, reason: 'upload.replaceTargetMissing' });
      continue;
    }

    const targetExt = path.extname(targetName).toLowerCase();
    const isStaticImageTarget = IMAGE_EXTENSIONS.has(targetExt);

    if (isStaticImageTarget) {
      const [optimizeError] = await tryCatch(writeOptimizedImage, {
        targetPath,
        buffer: file.buffer,
      });

      if (optimizeError) {
        const [fallbackError] = await tryCatch(() => fs.promises.writeFile(targetPath, file.buffer));
        if (fallbackError) {
          failed.push({ fileName: file.fileName, reason: 'upload.saveFailed' });
          continue;
        }
      }

      const processedBuffer = await readStaticImageBuffer(targetPath);
      if (processedBuffer) {
        const [derivedError] = await tryCatch(createImageDerivatives, {
          sourceBuffer: processedBuffer,
          album: sanitizedAlbum,
          outputBaseName: getDerivedBaseName(targetName),
        });

        if (derivedError) {
          await removeDerivedFiles({ folder: sanitizedAlbum, fileName: targetName });
        }
      }
    } else {
      const [writeError] = await tryCatch(() => fs.promises.writeFile(targetPath, file.buffer));
      if (writeError) {
        failed.push({ fileName: file.fileName, reason: 'upload.saveFailed' });
        continue;
      }
    }

    uploaded.push(targetName);
  }

  const media = await listAlbumMedia(sanitizedAlbum);
  const validNames = media.map((item) => item.fileName);

  if (uploaded.length > 0) {
    const albumDoc = await ensureAlbumDocument(sanitizedAlbum);
    const mergedOrder = [...albumDoc.imageOrder.filter((item) => validNames.includes(item))];
    const mergedExtraFiles = [...albumDoc.extraFiles.filter((item) => validNames.includes(item))];
    for (const fileName of uploaded) {
      if (!mergedOrder.includes(fileName)) {
        mergedOrder.push(fileName);
      }

      if (markAsExtra && !mergedExtraFiles.includes(fileName)) {
        mergedExtraFiles.push(fileName);
      }

      if (!markAsExtra && replaceTarget && mergedExtraFiles.includes(fileName)) {
        const index = mergedExtraFiles.indexOf(fileName);
        if (index >= 0) {
          mergedExtraFiles.splice(index, 1);
        }
      }
    }

    await prisma.album.update({
      where: { folder: sanitizedAlbum },
      data: {
        imageOrder: mergedOrder,
        extraFiles: mergedExtraFiles,
      },
    });
  }

  await syncImageOrder(sanitizedAlbum, validNames);

  return {
    status: 'success' as const,
    uploaded,
    failed,
  };
};

export const deleteAlbumFiles = async ({ folder, fileNames }: { folder: string; fileNames: string[] }) => {
  const sanitizedFolder = sanitizeSegment(folder);
  if (!isValidAlbumName(sanitizedFolder)) return { status: 'error', message: 'album.invalidName' as const };

  const uniqueFileNames = [...new Set(fileNames.map((fileName) => path.basename(fileName)))];
  const deleted: string[] = [];

  for (const fileName of uniqueFileNames) {
    const filePath = path.join(getAlbumDir(sanitizedFolder), fileName);
    const [unlinkError] = await tryCatch(fs.promises.unlink, filePath);
    if (!unlinkError) {
      deleted.push(fileName);
      await removeDerivedFiles({ folder: sanitizedFolder, fileName });
    }
  }

  const media = await listAlbumMedia(sanitizedFolder);
  await syncImageOrder(sanitizedFolder, media.map((item) => item.fileName));

  return { status: 'success' as const, deleted };
};

export const deleteAlbumCompletely = async (folder: string) => {
  const sanitizedFolder = sanitizeSegment(folder);
  if (!isValidAlbumName(sanitizedFolder)) return { status: 'error', message: 'album.invalidName' as const };

  const albumDir = getAlbumDir(sanitizedFolder);
  const derivedDir = getAlbumDerivedDir(sanitizedFolder);

  await tryCatch(() => fs.promises.rm(albumDir, { recursive: true, force: true }));
  await tryCatch(() => fs.promises.rm(derivedDir, { recursive: true, force: true }));
  await prisma.album.deleteMany({ where: { folder: sanitizedFolder } });

  return { status: 'success' as const };
};

export const reorderAlbumFiles = async ({ folder, order }: { folder: string; order: string[] }) => {
  const sanitizedFolder = sanitizeSegment(folder);
  if (!isValidAlbumName(sanitizedFolder)) return { status: 'error', message: 'album.invalidName' as const };

  const media = await listAlbumMedia(sanitizedFolder);
  const existingSet = new Set(media.map((item) => item.fileName));
  const normalizedOrder = [...new Set(order.map((item) => path.basename(item)).filter((item) => existingSet.has(item)))];

  for (const mediaItem of media) {
    if (!normalizedOrder.includes(mediaItem.fileName)) {
      normalizedOrder.push(mediaItem.fileName);
    }
  }

  await prisma.album.update({
    where: { folder: sanitizedFolder },
    data: { imageOrder: normalizedOrder },
  });

  return { status: 'success' as const, order: normalizedOrder };
};

export const updateAlbum = async ({
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
  const sourceFolder = sanitizeSegment(folder);
  if (!isValidAlbumName(sourceFolder)) return { status: 'error', message: 'album.invalidName' as const };

  let targetFolder = sourceFolder;
  if (renameFolder && renameFolder !== sourceFolder) {
    const sanitizedRename = sanitizeSegment(renameFolder);
    if (!isValidAlbumName(sanitizedRename)) {
      return { status: 'error', message: 'album.invalidName' as const };
    }

    if (await exists(getAlbumDir(sanitizedRename))) {
      return { status: 'error', message: 'album.exists' as const };
    }

    await fs.promises.rename(getAlbumDir(sourceFolder), getAlbumDir(sanitizedRename));
    if (await exists(getAlbumDerivedDir(sourceFolder))) {
      await fs.promises.rename(getAlbumDerivedDir(sourceFolder), getAlbumDerivedDir(sanitizedRename));
    }
    targetFolder = sanitizedRename;
  }

  await ensureAlbumDocument(sourceFolder);

  const media = await listAlbumMedia(targetFolder);
  const validFileNames = new Set(media.map((item) => item.fileName));
  const validThumbnail = thumbnailFile && media.some((item) => item.fileName === thumbnailFile)
    ? thumbnailFile
    : null;
  const validCoverFiles = (coverFiles ?? [])
    .map((item) => path.basename(item))
    .filter((item) => validFileNames.has(item))
    .slice(0, 4);
  const validExtraFiles = (extraFiles ?? [])
    .map((item) => path.basename(item))
    .filter((item) => validFileNames.has(item));

  const nextTheme = albumThemes.includes((theme || 'default') as AlbumTheme)
    ? (theme as AlbumTheme)
    : 'default';

  if (targetFolder !== sourceFolder) {
    await prisma.album.updateMany({
      where: { folder: sourceFolder },
      data: {
        folder: targetFolder,
        title: title?.trim() || targetFolder,
        hidden: hidden ?? false,
        theme: nextTheme,
        thumbnailFile: validThumbnail,
        coverFiles: validCoverFiles,
        extraFiles: validExtraFiles,
      },
    });
  } else {
    await prisma.album.update({
      where: { folder: targetFolder },
      data: {
        title: title?.trim() || targetFolder,
        hidden: hidden ?? undefined,
        theme: nextTheme,
        thumbnailFile: thumbnailFile === undefined ? undefined : validThumbnail,
        coverFiles: coverFiles === undefined ? undefined : validCoverFiles,
        extraFiles: extraFiles === undefined ? undefined : validExtraFiles,
      },
    });
  }

  return { status: 'success' as const, folder: targetFolder };
};

export const getDashboardData = async () => {
  const albums = await listAlbumsWithMedia({ includeHidden: false });
  const allMedia = albums.flatMap((album) => album.media.map((item) => ({ ...item, folder: album.folder, title: album.title })));
  const imageMedia = allMedia.filter((item) => item.kind !== 'video');

  const shuffle = <T,>(values: T[]): T[] => {
    const copy = [...values];
    for (let index = copy.length - 1; index > 0; index -= 1) {
      const randomIndex = Math.floor(Math.random() * (index + 1));
      [copy[index], copy[randomIndex]] = [copy[randomIndex], copy[index]];
    }
    return copy;
  };

  const firstCarousel = shuffle(imageMedia).slice(0, 12);
  const secondCarousel = shuffle(imageMedia).slice(0, 12);

  return {
    albums: albums.map((album) => {
      const mediaCoverFiles = album.coverFiles
        .map((fileName) => album.media.find((item) => item.fileName === fileName))
        .filter((item): item is MediaItem => !!item)
        .slice(0, 4);

      const fallback = album.thumbnailFile
        ? album.media.find((item) => item.fileName === album.thumbnailFile)
        : album.media[0];

      const coverMedia = mediaCoverFiles.length > 0
        ? mediaCoverFiles
        : (fallback ? [fallback] : []);

      return {
        folder: album.folder,
        title: album.title,
        theme: album.theme,
        imageCount: album.imageCount,
        updatedAt: album.updatedAt,
        coverUrls: coverMedia.map((item) => item.thumbUrl ?? item.lowQualityUrl ?? item.originalUrl),
        coverCount: coverMedia.length,
      };
    }),
    carousels: [firstCarousel, secondCarousel],
  };
};

export const getAlbumData = async ({ folder, includeHidden }: { folder: string; includeHidden?: boolean }) => {
  const sanitizedFolder = sanitizeSegment(folder);
  if (!isValidAlbumName(sanitizedFolder)) return null;

  const albumDoc = await getAlbumDocument(sanitizedFolder);
  if (!albumDoc) return null;
  if (!includeHidden && albumDoc.hidden) return null;

  const media = await listAlbumMedia(sanitizedFolder);
  const thumbnailFile = albumDoc.thumbnailFile && media.some((item) => item.fileName === albumDoc.thumbnailFile)
    ? albumDoc.thumbnailFile
    : media[0]?.fileName ?? null;
  const coverFiles = albumDoc.coverFiles
    .filter((item) => media.some((mediaItem) => mediaItem.fileName === item))
    .slice(0, 4);

  return {
    folder: sanitizedFolder,
    title: albumDoc.title,
    hidden: albumDoc.hidden,
    theme: albumDoc.theme,
    thumbnailFile,
    coverFiles,
    extraFiles: albumDoc.extraFiles.filter((item) => media.some((mediaItem) => mediaItem.fileName === item)),
    imageCount: media.length,
    updatedAt: albumDoc.updatedAt.getTime(),
    media,
  };
};

export const serveUploadAsset = async ({
  routePath,
  res,
  range,
}: {
  routePath: string;
  res: import('http').ServerResponse;
  range?: string;
}) => {
  const requested = decodeURIComponent(routePath.replace(/^\/uploads\//, '')).replace(/^\/+/, '');
  if (!requested || requested.includes('..')) {
    res.writeHead(400, { 'Content-Type': 'text/plain' });
    res.end('Invalid path');
    return;
  }

  let filePath = path.join(UPLOADS_DIR, requested);
  if (!(await exists(filePath)) && !path.extname(filePath)) {
    const fallbackPath = `${filePath}.webp`;
    if (await exists(fallbackPath)) {
      filePath = fallbackPath;
    }
  }

  const normalizedRoot = path.resolve(UPLOADS_DIR);
  const normalizedTarget = path.resolve(filePath);
  if (!normalizedTarget.startsWith(normalizedRoot)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('Forbidden');
    return;
  }

  const stat = await statSafe(filePath);
  if (!stat || !stat.isFile()) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
    return;
  }

  const mimeType = getMimeType(filePath);
  const immutable = filePath.includes(`${path.sep}_derived${path.sep}`);
  const cacheControl = immutable
    ? 'public, max-age=31536000, immutable'
    : 'public, max-age=604800';

  if (range && mimeType.startsWith('video/')) {
    const [startValue, endValue] = range.replace(/bytes=/, '').split('-');
    const start = Number.parseInt(startValue, 10) || 0;
    const end = endValue ? Number.parseInt(endValue, 10) : stat.size - 1;
    const chunkSize = (end - start) + 1;

    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${stat.size}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunkSize,
      'Content-Type': mimeType,
      'Cache-Control': cacheControl,
    });

    fs.createReadStream(filePath, { start, end }).pipe(res);
    return;
  }

  res.writeHead(200, {
    'Content-Type': mimeType,
    'Content-Length': stat.size,
    'Cache-Control': cacheControl,
  });

  fs.createReadStream(filePath).pipe(res);
};