export class CustomError extends Error {
  constructor(
    public type: string,
    message: string
  ) {
    super(message);
    this.name = 'CustomError';
  }
} 