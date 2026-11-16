import ApiError from '../utils/ApiError.js';

export const notFound = (req, res, next) =>
  next(new ApiError(404, `Route not found: ${req.method} ${req.originalUrl}`));

export const errorHandler = (err, req, res, next) => {
  let status = err.statusCode || 500;
  let message = err.message || 'Server error';
  let errors = err.errors;

  if (err.name === 'ValidationError' && err.errors && !Array.isArray(err.errors)) {
    status = 400;
    message = 'Validation failed';
    errors = Object.values(err.errors).map((e) => ({ field: e.path, message: e.message }));
  } else if (err.name === 'CastError') {
    status = 400;
    message = `Invalid value for ${err.path}`;
  } else if (err.code === 11000) {
    status = 409;
    message = `${Object.keys(err.keyValue || {}).join(', ') || 'Record'} already exists`;
  }

  const isProd = process.env.NODE_ENV === 'production';
  if (status === 500) {
    console.error(err);
    if (isProd) message = 'Something went wrong. Please try again.';
  }

  res.status(status).json({
    success: false,
    message,
    ...(errors && { errors }),
    ...(!isProd && status === 500 && { stack: err.stack }),
  });
};