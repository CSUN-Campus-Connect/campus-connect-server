const authConfig = {
  // HS256 secret key for signing JWT tokens
  jwt_secret: process.env.JWT_SECRET || ("default_secret" as string),

  jwt_expires_in: process.env.JWT_EXPIRES_IN || ("10s" as string),

  refresh_secret: process.env.REFRESH_SECRET || ("default_secret" as string),

  refresh_expires_in: process.env.REFRESH_SECRET_EXPIRES_IN || ("7d" as string),

  salt_rounds: parseInt(process.env.BCRYPT_SALT_ROUNDS || "11"),
};

export default authConfig;
