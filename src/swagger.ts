import swaggerUi from "swagger-ui-express";
import { Express } from "express";
import {
  OpenAPIRegistry,
  OpenApiGeneratorV3,
} from "@asteasolutions/zod-to-openapi";
import {
  createEventSchema,
  createEventSuccessSchema,
} from "@/modules/event/event.schemas";
import {
  CurrentUserSchema,
  DeleteUserSuccessSchema,
  LoginSchema,
  LoginSuccessSchema,
  PublicUserSchema,
  RefreshTokenSchema,
  RegisterSchema,
  RegisterSuccessSchema,
  UpsertProfileSuccessSchema,
} from "./modules/auth/auth.schemas";

export const registry = new OpenAPIRegistry();

const bearerAuth = registry.registerComponent(
  "securitySchemes",
  "Bearer Auth",
  {
    type: "http",
    scheme: "bearer",
    bearerFormat: "JWT",
  }
);

// Auth Endpoint Registry
registry.registerPath({
  method: "post",
  path: "/users/register",
  summary: "Register a new user",
  tags: ["Auth"],
  request: {
    body: {
      content: { "application/json": { schema: RegisterSchema.shape.body } },
    },
  },
  responses: {
    201: {
      description: "Object with user data",
      content: {
        "application/json": { schema: RegisterSuccessSchema },
      },
    },
    400: { description: "Invalid input" },
    409: { description: "Email already in use" },
    500: { description: "Internal server error" },
  },
});

registry.registerPath({
  method: "post",
  path: "/users/login",
  summary: "Login a user",
  tags: ["Auth"],
  request: {
    body: {
      content: { "application/json": { schema: LoginSchema.shape.body } },
    },
  },
  responses: {
    200: {
      description: "Object with token",
      content: {
        "application/json": { schema: LoginSuccessSchema },
      },
    },
    400: { description: "Request body is invalid" },
    401: { description: "Invalid login credentials" },
    404: { description: "Invalid email or password" },
    500: { description: "Internal server error" },
  },
});

registry.registerPath({
  method: "post",
  path: "/users/refresh",
  summary: "Refresh access token",
  tags: ["Auth"],
  security: [{ [bearerAuth.name]: [] }],
  responses: {
    201: {
      description: "Object with new access token",
      content: {
        "application/json": { schema: RefreshTokenSchema },
      },
    },
    403: { description: "Refresh token is invalid or expired" },
    500: { description: "Internal server error" },
  },
});

registry.registerPath({
  method: "get",
  path: "/users/me",
  summary: "Get current user",
  tags: ["Auth"],
  security: [{ [bearerAuth.name]: [] }],
  responses: {
    200: {
      description: "Object with current user data",
      content: {
        "application/json": { schema: CurrentUserSchema },
      },
    },
    401: { description: "Token is invalid or expired" },
    500: { description: "Internal server error" },
  },
});

registry.registerPath({
  method: "get",
  path: "/users/:id",
  summary: "Get public user profile",
  tags: ["Auth"],
  parameters: [
    {
      name: "id",
      in: "path",
      required: true,
      schema: { type: "string", format: "uuid" },
      description: "User ID",
    },
  ],
  responses: {
    200: {
      description: "Object with public user profile",
      content: {
        "application/json": { schema: PublicUserSchema },
      },
    },
    404: { description: "User not found" },
    500: { description: "Internal server error" },
  },
});

registry.registerPath({
  method: "delete",
  path: "/users/:id",
  summary: "Delete user profile",
  tags: ["Auth"],
  security: [{ [bearerAuth.name]: [] }],
  parameters: [
    {
      name: "id",
      in: "path",
      required: true,
      schema: { type: "string", format: "uuid" },
      description: "User ID",
    },
  ],
  responses: {
    200: {
      description: "Object with public user profile",
      content: {
        "application/json": { schema: DeleteUserSuccessSchema },
      },
    },
    404: { description: "User not found" },
    500: { description: "Internal server error" },
  },
});

registry.registerPath({
  method: "put",
  path: "/users/upsert-profile",
  summary: "Upsert user profile",
  tags: ["Auth"],
  security: [{ [bearerAuth.name]: [] }],
  request: {
    body: {
      content: { "application/json": { schema: PublicUserSchema } },
    },
  },
  responses: {
    200: {
      description: "Object with updated user profile",
      content: {
        "application/json": { schema: UpsertProfileSuccessSchema },
      },
    },
    401: { description: "Unauthorized: User ID missing or token invalid" },
    500: { description: "Internal server error" },
  },
});

// Events Endpoint Registry
registry.registerPath({
  method: "post",
  path: "/events",
  summary: "Create a new event",
  tags: ["Events"],
  security: [{ [bearerAuth.name]: [] }],
  request: {
    body: {
      content: { "application/json": { schema: createEventSchema.shape.body } },
    },
  },
  responses: {
    201: {
      description: "Object with event data",
      content: {
        "application/json": { schema: createEventSuccessSchema },
      },
    },
    400: { description: "Request body is invalid" },
    401: { description: "Token is invalid or expired" },
    500: { description: "Internal server error" },
  },
});

const generator = new OpenApiGeneratorV3(registry.definitions);

const swaggerSpec = generator.generateDocument({
  openapi: "3.0.3",
  info: {
    title: "CampusConnect API",
    version: "1.0.0",
    description: "API documentation for CampusConnect",
  },
  servers: [{ url: "/api/v1" }],
});

const swaggerOptions = {
  customSiteTitle: "CampusConnect API Docs",
  displayRequestDuration: true,
  defaultModelsExpandDepth: -1,
  customCss:
    ".models { display: none !important} .swagger-ui .topbar { display: none } .swagger-ui .response-col_links { display: none }",
};

export const setupSwaggerDocs = (app: Express) => {
  app.use(
    "/api/docs",
    swaggerUi.serve,
    swaggerUi.setup(swaggerSpec, swaggerOptions)
  );
  console.log(`
    Swagger docs available at /api/docs
    `);
};
