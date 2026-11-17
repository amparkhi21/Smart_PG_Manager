import ApiError from '../utils/ApiError.js';

export const notFound = (req, res, next) =>
  next(new ApiError(404, 'Route not found'));

export const errorHandler = (err, req, res, next) => {
  if (res.headersSent) return next(err);
  let status = err.statusCode || err.status || 500;
  if (!Number.isInteger(status) || status < 400 || status > 599) status = 500;
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
  if (status >= 500) {
    console.error('API request failed', { method: req.method, path: req.path, status });
    if (isProd) message = 'Something went wrong. Please try again.';
    if (isProd) errors = undefined;
  } else if (err.type === 'entity.parse.failed') {
    message = 'Invalid JSON request body';
  } else if (err.type === 'entity.too.large') {
    message = 'Request body is too large';
  }

  res.status(status).json({
    success: false,
    message,
    ...(errors && { errors }),
    ...(!isProd && status === 500 && { stack: err.stack }),
  });
};
