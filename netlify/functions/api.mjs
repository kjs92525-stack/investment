import { handleApi } from '../../api/yahoo.mjs';

export default (request) => handleApi(request);

export const config = { path: '/api/*' };
