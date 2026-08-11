import bcrypt from "bcryptjs";
import { jwtVerify, SignJWT } from "jose";
import type { Request } from "express";
import type { User } from "../../src/types.js";
import type { Store } from "../store.js";
import type { PlatformConfig } from "./config.js";
import type { Authenticator } from "./contracts.js";
import type { Database } from "./database.js";

const roles = new Set([
  "investor",
  "partner",
  "knowledge_admin",
  "system_admin",
]);

export class JwtAuthenticator implements Authenticator {
  private readonly secret: Uint8Array;
  constructor(
    private readonly config: PlatformConfig,
    private readonly database?: Database,
  ) {
    this.secret = new TextEncoder().encode(config.JWT_SECRET);
  }

  async authenticate(req: Request, store: Store): Promise<User> {
    if (this.config.AUTH_MODE === "demo")
      return store.user(String(req.header("x-user-id") || "u-investor"));
    const header = req.header("authorization");
    if (!header?.startsWith("Bearer ")) throw new Error("AUTH_REQUIRED");
    const { payload } = await jwtVerify(header.slice(7), this.secret, {
      issuer: this.config.JWT_ISSUER,
      audience: this.config.JWT_AUDIENCE,
    });
    const role = String(payload.role || "");
    if (!payload.sub || !roles.has(role)) throw new Error("AUTH_INVALID");
    return {
      id: payload.sub,
      name: String(payload.name || payload.sub),
      role: role as User["role"],
      projectIds: Array.isArray(payload.project_ids)
        ? payload.project_ids.map(String)
        : [],
    };
  }

  async login(email: string, password: string, store: Store) {
    let user: User | undefined;
    let passwordHash: string | undefined;
    if (this.config.AUTH_MODE === "demo") {
      user = store.data.users.find(
        (candidate) => `${candidate.id}@demo.local` === email,
      );
      passwordHash = await bcrypt.hash("demo-password", 10);
    } else {
      const row = await this.database?.findUserByEmail(email);
      if (row) {
        user = row.user;
        passwordHash = row.passwordHash;
      }
    }
    if (
      !user ||
      !passwordHash ||
      !(await bcrypt.compare(password, passwordHash))
    )
      throw new Error("AUTH_INVALID_CREDENTIALS");
    const accessToken = await new SignJWT({
      name: user.name,
      role: user.role,
      project_ids: user.projectIds,
    })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(user.id)
      .setIssuer(this.config.JWT_ISSUER)
      .setAudience(this.config.JWT_AUDIENCE)
      .setIssuedAt()
      .setExpirationTime("8h")
      .sign(this.secret);
    return { accessToken, user };
  }
}
