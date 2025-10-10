import { useQuery } from '@tanstack/react-query';

import { sessionQueryOptions } from '../api/session';

export const useSessionQuery = () => useQuery(sessionQueryOptions);
