import { AuthProps, SessionLayout } from '../../../config';
import { ApiResponse, Functions } from '../../../src/_sockets/apiTypes.generated';
import { listAlbumsWithMedia } from '../../../server/media/mediaLibrary';

export const auth: AuthProps = {
  login: false,
  additional: [],
};

export const httpMethod: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET';

export interface ApiParams {
  data: {
    includeHidden?: boolean;
  };
  user: SessionLayout;
  functions: Functions;
}

export const main = async ({ data }: ApiParams): Promise<ApiResponse> => {
  const includeHidden = data.includeHidden === undefined
    ? true
    : String(data.includeHidden) === 'true';
  const result = await listAlbumsWithMedia({ includeHidden });

  return {
    status: 'success',
    result,
  };
};
