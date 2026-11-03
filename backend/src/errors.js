import { ZodError } from "zod";

export class AppError extends Error {
  constructor(status, message, errors = null) {
    super(message);
    this.status = status;
    this.errors = errors;
  }
}

export function describeError(error) {
  if (error instanceof ZodError) {
    const { fieldErrors, formErrors } = error.flatten();
    const errors = formErrors.length ? { ...fieldErrors, non_field_errors: formErrors } : fieldErrors;
    return { status: 400, body: { message: "Please fix the highlighted fields.", errors } };
  }
  if (error instanceof AppError) {
    return { status: error.status, body: { message: error.message, errors: error.errors } };
  }
  if (error.type === "entity.parse.failed") {
    return { status: 400, body: { message: "Request body is not valid JSON.", errors: null } };
  }
  if (error.type === "entity.too.large") {
    return { status: 413, body: { message: "Request body is too large.", errors: null } };
  }
  if (error.code === 11000) {
    return { status: 409, body: { message: "That value is already in use.", errors: null } };
  }
  console.error(error);
  return { status: 500, body: { message: "Something went wrong. Please try again.", errors: null } };
}

export const notFound = (req, res) => res.status(404).json({ message: "Route not found.", errors: null });

export function errorHandler(error, req, res, next) {
  const { status, body } = describeError(error);
  res.status(status).json(body);
}
