import { AuthProps, SessionLayout } from '../../../config';
import { ApiResponse, Functions } from '../../../src/_sockets/apiTypes.generated';
import { ParsedMultipartFile, uploadFilesToAlbum } from '../../../server/media/mediaLibrary';

export const auth: AuthProps = {
  login: false,
  additional: [],
};

export interface ApiParams {
  data: {
    folder: string;
    replaceTarget?: string;
    markAsExtra?: boolean;
    files: {
      fileName: string;
      mimeType: string;
      base64: string;
    }[];
  };
  user: SessionLayout;
  functions: Functions;
}

export const main = async ({ data }: ApiParams): Promise<ApiResponse> => {
  const parsedFiles: ParsedMultipartFile[] = data.files.map((file) => ({
    fieldName: 'files',
    fileName: file.fileName,
    mimeType: file.mimeType,
    buffer: Buffer.from(file.base64, 'base64'),
  }));

  const result = await uploadFilesToAlbum({
    album: data.folder,
    files: parsedFiles,
    replaceTarget: data.replaceTarget,
    markAsExtra: data.markAsExtra,
  });

  if (result.status === 'error') {
    return {
      status: 'error',
      errorCode: result.message ?? 'api.internalServerError',
    };
  }

  return {
    status: 'success',
    uploaded: result.uploaded,
    failed: result.failed,
  };
};
