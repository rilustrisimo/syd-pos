export declare const validateTransaction: (data: any) => {
    valid: boolean;
    errors: string[];
};
export declare const validateTransactionLine: (line: any) => {
    valid: boolean;
    errors: string[];
};
export declare const validateProduct: (data: any) => {
    valid: boolean;
    errors: string[];
};
export declare const validateCustomer: (data: any) => {
    valid: boolean;
    errors: string[];
};
export declare const validateReturn: (data: any) => {
    valid: boolean;
    errors: string[];
};
export declare const isValidNumber: (value: any, min?: number, max?: number) => boolean;
export declare const isValidDiscount: (discount: number, lineTotal: number) => boolean;
export declare const calculateTransactionTotal: (lines: any[]) => number;
export declare const isInventorySufficient: (available: number, required: number) => boolean;
export declare const isValidReturnQuantity: (returnQuantity: number, originalQuantity: number, previousReturnQuantity?: number) => boolean;
declare const _default: {
    validateTransaction: (data: any) => {
        valid: boolean;
        errors: string[];
    };
    validateTransactionLine: (line: any) => {
        valid: boolean;
        errors: string[];
    };
    validateProduct: (data: any) => {
        valid: boolean;
        errors: string[];
    };
    validateCustomer: (data: any) => {
        valid: boolean;
        errors: string[];
    };
    validateReturn: (data: any) => {
        valid: boolean;
        errors: string[];
    };
    isValidNumber: (value: any, min?: number, max?: number) => boolean;
    isValidDiscount: (discount: number, lineTotal: number) => boolean;
    calculateTransactionTotal: (lines: any[]) => number;
    isInventorySufficient: (available: number, required: number) => boolean;
    isValidReturnQuantity: (returnQuantity: number, originalQuantity: number, previousReturnQuantity?: number) => boolean;
};
export default _default;
//# sourceMappingURL=validation.d.ts.map