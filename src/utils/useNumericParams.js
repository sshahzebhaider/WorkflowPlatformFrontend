import { useParams } from 'react-router-dom';
import { normalizeRouteParams } from './routeIds';
/** React Router returns strings even when SQL identifiers are numeric. */
export function useNumericParams() {
    return normalizeRouteParams(useParams(), import.meta.env.VITE_DATA_MODE !== 'mock');
}
