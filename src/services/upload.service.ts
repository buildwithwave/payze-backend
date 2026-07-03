import { cloudinary } from "../config/cloudinary";
import { AppError } from "../utils/appError";

export class UploadService {
  static uploadImage(file: Express.Multer.File, folder = "payze/products"): Promise<string> {
    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream({ folder }, (error, result) => {
        if (error) return reject(new AppError(error.message));
        if (!result) return reject(new AppError("Upload failed"));
        resolve(result.secure_url);
      });

      uploadStream.end(file.buffer);
    });
  }
}
