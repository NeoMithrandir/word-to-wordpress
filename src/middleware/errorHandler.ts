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

  // Send error response
  if (process.env.NODE_ENV === 'development') {
    res.status(err.statusCode).json({
      success: false,
      error: {
        message: err.message,
        stack: err.stack,
        statusCode: err.statusCode
      }
    });
  } else {
    // Production - send limited error info
    if (err.isOperational) {
      res.status(err.statusCode).json({
        success: false,
        error: {
          message: err.message
        }
      });
    } else {
      // Programming error - don't leak details
      res.status(500).json({
        success: false,
        error: {
          message: 'Something went wrong'
        }
      });
    }
  }
};

export const createError = (message: string, statusCode: number = 500): AppError => {
  const error = new Error(message) as AppError;
  error.statusCode = statusCode;
  error.status = statusCode < 500 ? 'fail' : 'error';
  error.isOperational = true;
  return error;
}; 