import {
     GetObjectCommand,
     PutObjectCommand,
     DeleteObjectCommand,
     S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { awsConfig } from '../config/app.config';

const s3_client = new S3Client({
     region: awsConfig.AWS_REGION,
     credentials: {
          accessKeyId: awsConfig.credentials.accessKeyId,
          secretAccessKey: awsConfig.credentials.secretAccessKey,
     },
});

export const upload_to_s3 = async (
     file: Express.Multer.File,
     folder: string = 'uploads'
): Promise<{ url: string; key: string }> => {
     const fileExtension = file.originalname.split('.').pop();
     const fileKey = `${folder}/${crypto.randomUUID()}.${fileExtension}`;
     const command = new PutObjectCommand({
          Bucket: awsConfig.AWS_S3_BUCKET_NAME,
          Key: fileKey,
          Body: file.buffer,
          ContentType: file.mimetype,
     });
     await s3_client.send(command);
     const url = `https://${awsConfig.AWS_S3_BUCKET_NAME}.s3.${awsConfig.AWS_REGION}.amazonaws.com/${fileKey}`;
     return { url, key: fileKey };
};

export const get_s3_key_from_url = (urlOrKey: string): string => {
     try {
          if (!urlOrKey) return '';
          if (
               urlOrKey.startsWith('http://') ||
               urlOrKey.startsWith('https://')
          ) {
               const parsedUrl = new URL(urlOrKey);
               if (parsedUrl.hostname.endsWith('.amazonaws.com')) {
                    const pathParts = parsedUrl.pathname
                         .split('/')
                         .filter(Boolean);
                    if (parsedUrl.hostname.includes('.s3.')) {
                         // Format: bucket-name.s3.region.amazonaws.com/key
                         return pathParts.join('/');
                    } else if (parsedUrl.hostname.startsWith('s3.')) {
                         // Format: s3.region.amazonaws.com/bucket-name/key
                         return pathParts.slice(1).join('/');
                    }
               }
               return parsedUrl.pathname.substring(1);
          }
          return urlOrKey;
     } catch {
          return urlOrKey;
     }
};

const presignedUrlCache = new Map<string, { url: string; expiresAt: number }>();

export const get_presigned_url = async (
     fileKeyOrUrl: string,
     expiresIn: number = 900
): Promise<string> => {
     if (!fileKeyOrUrl) return '';
     const fileKey = get_s3_key_from_url(fileKeyOrUrl);
     if (!fileKey) return '';

     const now = Date.now();
     const cached = presignedUrlCache.get(fileKey);
     if (cached && cached.expiresAt > now + 60000) {
          return cached.url;
     }

     const command = new GetObjectCommand({
          Bucket: awsConfig.AWS_S3_BUCKET_NAME,
          Key: fileKey,
     });
     const signedUrl = await getSignedUrl(s3_client, command, { expiresIn });
     presignedUrlCache.set(fileKey, {
          url: signedUrl,
          expiresAt: now + expiresIn * 1000,
     });
     return signedUrl;
};

/**
 * Presigned URL without caching, for links that must keep working for days
 * (e.g. book covers inside emails). AWS allows at most 7 days.
 */
export const get_long_lived_presigned_url = async (
     fileKeyOrUrl: string,
     expiresIn: number = 7 * 24 * 60 * 60
): Promise<string> => {
     if (!fileKeyOrUrl) return '';
     const fileKey = get_s3_key_from_url(fileKeyOrUrl);
     if (!fileKey) return '';
     const command = new GetObjectCommand({
          Bucket: awsConfig.AWS_S3_BUCKET_NAME,
          Key: fileKey,
     });
     return getSignedUrl(s3_client, command, { expiresIn });
};

/**
 * If `url` points at a book preview PDF in OUR bucket, return its S3 key
 * (e.g. "previews/<uuid>.pdf"); otherwise null. Used by the public preview
 * proxy so it can never be used to fetch arbitrary URLs.
 */
export const get_preview_key_from_url = (url: string): string | null => {
     let parsed: URL;
     try {
          parsed = new URL(url);
     } catch {
          return null;
     }
     if (parsed.protocol !== 'https:') return null;

     const bucket = awsConfig.AWS_S3_BUCKET_NAME;
     const region = awsConfig.AWS_REGION;
     const host = parsed.hostname.toLowerCase();
     let key: string;
     if (host === `${bucket}.s3.${region}.amazonaws.com` || host === `${bucket}.s3.amazonaws.com`) {
          key = parsed.pathname.slice(1);
     } else if (host === `s3.${region}.amazonaws.com` && parsed.pathname.startsWith(`/${bucket}/`)) {
          key = parsed.pathname.slice(bucket.length + 2);
     } else {
          return null;
     }

     try {
          key = decodeURIComponent(key);
     } catch {
          return null;
     }
     // Only files uploaded to the previews/ folder, no path tricks
     if (!/^previews\/[A-Za-z0-9._-]+$/.test(key) || key.includes('..')) return null;
     return key;
};

export const delete_from_s3 = async (fileKeyOrUrl: string): Promise<void> => {
     try {
          const fileKey = get_s3_key_from_url(fileKeyOrUrl);
          if (!fileKey) return;
          const command = new DeleteObjectCommand({
               Bucket: awsConfig.AWS_S3_BUCKET_NAME,
               Key: fileKey,
          });
          await s3_client.send(command);
     } catch (error) {
          console.error(
               `Failed to delete file from S3: ${fileKeyOrUrl}`,
               error
          );
     }
};

export const upload_buffer_to_s3 = async (
     buffer: Buffer,
     fileKey: string,
     mimetype: string = 'application/pdf'
): Promise<{ url: string; key: string }> => {
     const command = new PutObjectCommand({
          Bucket: awsConfig.AWS_S3_BUCKET_NAME,
          Key: fileKey,
          Body: buffer,
          ContentType: mimetype,
     });
     await s3_client.send(command);
     const url = `https://${awsConfig.AWS_S3_BUCKET_NAME}.s3.${awsConfig.AWS_REGION}.amazonaws.com/${fileKey}`;
     return { url, key: fileKey };
};
