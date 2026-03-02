import { AuthProps, SessionLayout } from '../../../config';
import { ApiResponse, Functions } from '../../../src/_sockets/apiTypes.generated';
import { getDashboardData } from '../../../server/media/mediaLibrary';

export const auth: AuthProps = {
  login: false,
  additional: [],
};

export const httpMethod: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET';

export interface ApiParams {
  data: {};
  user: SessionLayout;
  functions: Functions;
}

export const main = async (): Promise<ApiResponse> => {
  const result = await getDashboardData();

  return {
    status: 'success',
    result,
  };
};
