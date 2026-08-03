const fs = require('fs').promises;
const path = require('path');
const cloudinary = require('cloudinary').v2;

// Configure Cloudinary if credentials exist
if (process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
  });
}

/**
 * Uploads a base64 media file (image or video) to Cloudinary or writes to local disk.
 * @param {string} base64Str Base64 Data URL string (e.g. data:image/jpeg;base64,...)
 * @param {string} folder Target subfolder (e.g. 'products' or 'receipts')
 * @returns {Promise<string>} The URL of the uploaded file
 */
const uploadFile = async (base64Str, folder = 'products') => {
  if (!base64Str) return null;

  // If Cloudinary is configured, use it
  const isCloudinaryConfigured = process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET;

  if (isCloudinaryConfigured) {
    try {
      const uploadResponse = await cloudinary.uploader.upload(base64Str, {
        folder: folder,
        resource_type: 'auto'
      });
      return uploadResponse.secure_url;
    } catch (err) {
      console.error('Cloudinary upload error, falling back to local storage:', err);
    }
  }

  // Local Storage Fallback
  try {
    // 1. Ensure folder exists
    const uploadsDir = path.join(__dirname, '../uploads', folder);
    await fs.mkdir(uploadsDir, { recursive: true });

    // 2. Parse MIME type and extension
    const matches = base64Str.match(/^data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+);base64,(.*)$/);
    if (!matches || matches.length !== 3) {
      throw new Error('Invalid base64 string format');
    }

    const mimeType = matches[1];
    const base64Data = matches[2];

    // Determine extension from MIME type
    let extension = 'bin';
    if (mimeType.includes('image/jpeg') || mimeType.includes('image/jpg')) extension = 'jpg';
    else if (mimeType.includes('image/png')) extension = 'png';
    else if (mimeType.includes('image/gif')) extension = 'gif';
    else if (mimeType.includes('image/webp')) extension = 'webp';
    else if (mimeType.includes('video/mp4')) extension = 'mp4';
    else if (mimeType.includes('video/quicktime')) extension = 'mov';
    else if (mimeType.includes('video/webm')) extension = 'webm';
    else {
      // Fallback parse extension
      const parsedExt = mimeType.split('/')[1];
      if (parsedExt) extension = parsedExt;
    }

    // 3. Generate unique filename
    const filename = `${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}.${extension}`;
    const filePath = path.join(uploadsDir, filename);

    // 4. Decode base64 to binary buffer and write
    const buffer = Buffer.from(base64Data, 'base64');
    await fs.writeFile(filePath, buffer);

    console.log(`Local file saved at: ${filePath}`);
    
    // Return relative URL that our Express server will serve static
    return `/uploads/${folder}/${filename}`;
  } catch (error) {
    console.error('Local file write error:', error);
    throw error;
  }
};

module.exports = { uploadFile };
