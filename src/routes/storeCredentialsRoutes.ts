import { NextFunction, Request, Response, Router } from 'express';
import multer from 'multer';
import { authenticate, requireStoreAdmin } from '../middleware/auth';
import { requirePlatformOps } from '../middleware/platformOps';
import * as storeCredentialsController from '../controllers/storeCredentialsController';

const router = Router();

/**
 * Store-owned Apple App Store Connect and Google Play credentials (issue #185).
 * Store admins act on their own store. The path store id on the admin read is
 * for platform operators only and returns status, not secrets.
 */

const storeAdminGuard = requireStoreAdmin.map(middleware => middleware as any);

const MAX_UPLOAD_BYTES = 64 * 1024;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_UPLOAD_BYTES,
    fieldSize: MAX_UPLOAD_BYTES,
    files: 1,
    fields: 8,
    parts: 12,
  },
});

const acceptUpload = (fieldName: string) => {
  const parser = upload.single(fieldName);
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.is('multipart/form-data')) {
      next();
      return;
    }
    parser(req, res, (err: unknown) => {
      if (!err) {
        next();
        return;
      }
      req.body = { redacted: true };
      const tooLarge = err instanceof multer.MulterError && (
        err.code === 'LIMIT_FILE_SIZE' || err.code === 'LIMIT_FIELD_VALUE'
      );
      res.status(400).json({
        success: false,
        error: tooLarge
          ? 'That file is too large. Upload the original key file.'
          : 'That file could not be read. Upload the original key file.',
        code: 'STORE_CREDENTIALS_INVALID',
      });
    });
  };
};

router.get(
  '/store-credentials',
  ...storeAdminGuard,
  storeCredentialsController.getCredentials as any
);

router.post(
  '/store-credentials/apple',
  ...storeAdminGuard,
  acceptUpload('privateKey'),
  storeCredentialsController.upsertApple as any
);

router.post(
  '/store-credentials/google',
  ...storeAdminGuard,
  acceptUpload('serviceAccount'),
  storeCredentialsController.upsertGoogle as any
);

router.delete(
  '/store-credentials/apple',
  ...storeAdminGuard,
  storeCredentialsController.deleteApple as any
);

router.delete(
  '/store-credentials/google',
  ...storeAdminGuard,
  storeCredentialsController.deleteGoogle as any
);

router.get(
  '/admin/store-credentials/:storeId',
  authenticate as any,
  requirePlatformOps as any,
  storeCredentialsController.getAdminCredentials as any
);

export default router;
