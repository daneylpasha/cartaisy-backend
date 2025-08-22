interface ValidationError {
    field: string;
    message: string;
    severity: 'error' | 'warning';
}
/**
 * Validates tenant configuration and returns validation results
 * @returns Array of validation errors/warnings
 */
export declare const validateTenantConfig: () => ValidationError[];
/**
 * Logs configuration summary without sensitive information
 */
export declare const logConfigSummary: () => void;
/**
 * Throws error if critical configuration is missing
 * Should be called during app initialization
 */
export declare const validateRequiredConfig: () => void;
/**
 * Gets a summary of the current configuration
 * @returns Configuration summary object
 */
export declare const getConfigSummary: () => {
    store: {
        name: string;
        domain: string;
        currency: string;
        country: string;
    };
    environment: string;
    features: string[];
    integrations: {
        shopify: boolean;
        stripe: boolean;
        paypal: boolean;
        email: string;
        analytics: boolean;
    };
    validation: {
        errors: number;
        warnings: number;
    };
};
declare const _default: {
    validateTenantConfig: () => ValidationError[];
    validateRequiredConfig: () => void;
    logConfigSummary: () => void;
    getConfigSummary: () => {
        store: {
            name: string;
            domain: string;
            currency: string;
            country: string;
        };
        environment: string;
        features: string[];
        integrations: {
            shopify: boolean;
            stripe: boolean;
            paypal: boolean;
            email: string;
            analytics: boolean;
        };
        validation: {
            errors: number;
            warnings: number;
        };
    };
};
export default _default;
//# sourceMappingURL=validateConfig.d.ts.map