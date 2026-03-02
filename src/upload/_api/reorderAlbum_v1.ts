import { AuthProps, SessionLayout } from '../../../config';
import { ApiResponse, Functions } from '../../../src/_sockets/apiTypes.generated';
import { reorderAlbumFiles } from '../../../server/media/mediaLibrary';

export const auth: AuthProps = {
  login: false,
  additional: [],
};

export const httpMethod: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'PUT';

export interface ApiParams {
  data: {
    folder: string;
    order: string[];
  };
  user: SessionLayout;
  functions: Functions;
}

export const main = async ({ data }: ApiParams): Promise<ApiResponse> => {
  const result = await reorderAlbumFiles({
    folder: data.folder,
    order: data.order,
  });

  if (result.status === 'error') {
    return {
      status: 'error',
      errorCode: result.message ?? 'api.internalServerError',
    };
  }

  return {
    status: 'success',
    order: result.order,
  };
};
