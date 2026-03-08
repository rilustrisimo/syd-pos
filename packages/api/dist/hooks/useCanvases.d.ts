import { Canvas, CreateCanvasPayload } from '../types';
export declare const useCanvases: (page?: number, limit?: number, options?: {
    enabled?: boolean;
}) => import("@tanstack/react-query").UseQueryResult<{
    data: Canvas[];
    total: number;
    page: number;
    limit: number;
}, Error>;
export declare const useCanvas: (id: string | undefined) => import("@tanstack/react-query").UseQueryResult<Canvas | null, Error>;
export declare const useCreateCanvas: () => import("@tanstack/react-query").UseMutationResult<Canvas, Error, CreateCanvasPayload, unknown>;
export declare const useUpdateCanvas: () => import("@tanstack/react-query").UseMutationResult<Canvas, Error, {
    id: string;
    payload: Omit<CreateCanvasPayload, "userId">;
}, unknown>;
export declare const useDeleteCanvas: () => import("@tanstack/react-query").UseMutationResult<void, Error, string, unknown>;
export default useCanvases;
//# sourceMappingURL=useCanvases.d.ts.map