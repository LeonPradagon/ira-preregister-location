declare module 'multer' {
  interface DiskStorageOptions {
    destination: string;
    filename: (request: unknown, file: { originalname: string }, callback: (error: Error | null, filename: string) => void) => void;
  }

  export function diskStorage(options: DiskStorageOptions): any;
}
