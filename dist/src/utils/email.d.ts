/**
 * Sends an email
 * @param to - Recipient email address
 * @param subject - Email subject
 * @param html - HTML content of the email
 * @returns Promise<boolean> - true if email was sent successfully
 */
export declare const sendEmail: (to: string, subject: string, html: string) => Promise<boolean>;
/**
 * Sends welcome email to new user
 * @param email - User's email address
 * @param name - User's name
 * @returns Promise<boolean> - true if email was sent successfully
 */
export declare const sendWelcomeEmail: (email: string, name: string) => Promise<boolean>;
/**
 * Sends password reset email with token
 * @param email - User's email address
 * @param resetToken - Password reset token
 * @returns Promise<boolean> - true if email was sent successfully
 */
export declare const sendPasswordResetEmail: (email: string, resetToken: string) => Promise<boolean>;
/**
 * Sends email verification link
 * @param email - User's email address
 * @param name - User's name
 * @param verificationToken - Email verification token
 * @returns Promise<boolean> - true if email was sent successfully
 */
export declare const sendVerificationEmail: (email: string, name: string, verificationToken: string) => Promise<boolean>;
//# sourceMappingURL=email.d.ts.map