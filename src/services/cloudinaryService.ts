import { v2 as cloudinary } from 'cloudinary';

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

export interface UploadResult {
  publicId: string;
  url: string;
  secureUrl: string;
  size: number;
  width: number;
  height: number;
  format: string;
}

export interface CloudinarySignature {
  signature: string;
  timestamp: number;
  cloudName: string;
  apiKey: string;
  folder: string;
}

class CloudinaryService {

  /**
   * Check if Cloudinary is configured
   */
  isConfigured(): boolean {
    return !!(
      process.env.CLOUDINARY_CLOUD_NAME &&
      process.env.CLOUDINARY_API_KEY &&
      process.env.CLOUDINARY_API_SECRET
    );
  }

  /**
   * Generate signature for client-side upload
   */
  generateSignature(storeId: string): CloudinarySignature {
    const timestamp = Math.round(new Date().getTime() / 1000);
    const folder = `stores/${storeId}/notifications`;

    const paramsToSign = {
      timestamp,
      folder,
      transformation: 'c_limit,w_1024,h_1024,q_auto:good,f_auto'
    };

    const signature = cloudinary.utils.api_sign_request(
      paramsToSign,
      process.env.CLOUDINARY_API_SECRET!
    );

    return {
      signature,
      timestamp,
      cloudName: process.env.CLOUDINARY_CLOUD_NAME!,
      apiKey: process.env.CLOUDINARY_API_KEY!,
      folder
    };
  }

  /**
   * Upload image from buffer (server-side upload)
   */
  async uploadImage(
    buffer: Buffer,
    storeId: string,
    filename: string
  ): Promise<UploadResult> {
    return new Promise((resolve, reject) => {
      const folder = `stores/${storeId}/notifications`;

      cloudinary.uploader.upload_stream(
        {
          folder,
          public_id: `${Date.now()}_${filename.replace(/\.[^/.]+$/, '')}`,
          transformation: [
            { width: 1024, height: 1024, crop: 'limit' },
            { quality: 'auto:good' },
            { fetch_format: 'auto' }
          ],
          resource_type: 'image'
        },
        (error, result) => {
          if (error) {
            console.error('🖼️ [CLOUDINARY] Upload error:', error);
            reject(error);
          } else if (result) {
            console.log('🖼️ [CLOUDINARY] Upload success:', result.public_id);
            resolve({
              publicId: result.public_id,
              url: result.url,
              secureUrl: result.secure_url,
              size: result.bytes,
              width: result.width,
              height: result.height,
              format: result.format
            });
          }
        }
      ).end(buffer);
    });
  }

  /**
   * Delete image from Cloudinary
   */
  async deleteImage(publicId: string): Promise<boolean> {
    try {
      const result = await cloudinary.uploader.destroy(publicId);
      console.log('🖼️ [CLOUDINARY] Delete result:', result);
      return result.result === 'ok';
    } catch (error) {
      console.error('🖼️ [CLOUDINARY] Delete error:', error);
      return false;
    }
  }

  /**
   * Delete multiple images
   */
  async deleteImages(publicIds: string[]): Promise<number> {
    if (publicIds.length === 0) return 0;

    try {
      const result = await cloudinary.api.delete_resources(publicIds);
      const deletedCount = Object.values(result.deleted).filter(v => v === 'deleted').length;
      console.log(`🖼️ [CLOUDINARY] Bulk delete: ${deletedCount}/${publicIds.length}`);
      return deletedCount;
    } catch (error) {
      console.error('🖼️ [CLOUDINARY] Bulk delete error:', error);
      return 0;
    }
  }
}

export const cloudinaryService = new CloudinaryService();
