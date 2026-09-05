import { Request, Response, NextFunction } from 'express';

export interface AppError extends Error {
  statusCode?: number;
  status?: string;
  isOperational?: boolean;
}

export const errorHandler = (
  err: AppError,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  // Set default values
  err.statusCode = err.statusCode || 500;
  err.status = err.status || 'error';

  // Log error for debugging
  console.error('Error occurred:', {
    message: err.message,
    stack: err.stack,
    statusCode: err.statusCode,
    url: req.url,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent')
  });

  const isDev = process.env.NODE_ENV !== 'production';
  const isPayloadTooLarge =
    err.statusCode === 413 ||
    err.name === 'PayloadTooLargeError' ||
    err.message === 'request entity too large';

  if (isPayloadTooLarge) {
    res.status(413).json({
      success: false,
      error: {
        message:
          'This document is too large to send in one request. Re-upload the file and publish again so the server can use the cached copy.'
      }
    });
    return;
  }

  // Send error response. Unset NODE_ENV is treated as development so local
  // `npm run server:dev` surfaces the real message instead of a generic 500.
  if (isDev) {
    res.status(err.statusCode).json({
      success: false,
      error: {
        message: err.message,
        stack: err.stack,
        statusCode: err.statusCode
      }
    });
  } else if (err.isOperational || (err.statusCode && err.statusCode < 500)) {
    res.status(err.statusCode).json({
      success: false,
      error: {
        message: err.message
      }
    });
  } else {
    res.status(500).json({
      success: false,
      error: {
        message: 'Something went wrong'
      }
    });
  }
};

export const createError = (message: string, statusCode: number = 500): AppError => {
  const error = new Error(message) as AppError;
  error.statusCode = statusCode;
  error.status = statusCode < 500 ? 'fail' : 'error';
  error.isOperational = true;
  return error;
}; 