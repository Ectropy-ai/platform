/**
 * JWT Service for Token Management
 */

import jwt, { TokenExpiredError, JsonWebTokenError } from 'jsonwebtoken';
import { JWTPayload, TokenPair, AuthConfig } from '../types/auth.types.js';
import { logger } from '@ectropy/shared/utils';
export class JWTService {
  private config: AuthConfig;
  constructor(config: AuthConfig) {
    this.config = config;
  }
  public generateAccessToken(payload: Omit<JWTPayload, 'iat' | 'exp'>): string {
    try {
      const token = jwt.sign(payload, this.config.jwtSecret, {
        expiresIn: this.config.jwtExpiresIn as any, // Type assertion for compatibility
        issuer: 'ectropy-platform',
        audience: 'ectropy-users',
      });
      logger.debug('Access token generated', {
        userId: payload.userId,
        sessionId: payload.sessionId,
      });
      return token;
    } catch (_error) {
      logger.error('Failed to generate access token', {
        error: _error as Error,
      });
      throw _error;
    }
  }

  public generateRefreshToken(
    userId: string,
    sessionId: string,
    roles: string[] = []
  ): string {
    try {
      const payload = {
        userId,
        sessionId,
        roles,
        type: 'refresh',
      };

      const token = jwt.sign(payload, this.config.jwtSecret, {
        expiresIn: this.config.refreshTokenExpiresIn as any, // Type assertion for compatibility
      });

      logger.debug('Refresh token generated', { userId, sessionId });
      return token;
    } catch (error) {
      logger.error('Failed to generate refresh token', {
        userId,
        sessionId,
        error: error as Error,
      });
      throw error;
    }
  }
  public generateTokenPair(
    payload: Omit<JWTPayload, 'iat' | 'exp'>
  ): TokenPair {
    const accessToken = this.generateAccessToken(payload);
    const refreshToken = this.generateRefreshToken(
      payload.userId,
      payload.sessionId,
      payload.roles
    );
    // Extract expiration from access token
    const decoded = jwt.decode(accessToken) as any;
    const expiresIn = decoded.exp - Math.floor(Date.now() / 1000);
    return {
      accessToken,
      refreshToken,
      expiresIn,
    };
  }

  public verifyAccessToken(token: string): JWTPayload {
    try {
      const payload = jwt.verify(token, this.config.jwtSecret) as JWTPayload;
      logger.debug('Access token verified', {
        userId: payload.userId,
        exp: payload.exp,
      });
      return payload;
    } catch (error) {
      if (error instanceof TokenExpiredError) {
        logger.warn('Access token expired', { token: token.substring(0, 20) });
        throw new Error('TOKEN_EXPIRED');
      } else if (error instanceof JsonWebTokenError) {
        logger.warn('Invalid access token', { token: token.substring(0, 20) });
        throw new Error('INVALID_TOKEN');
      } else {
        logger.error('Token verification failed', { error: error as Error });
        throw error;
      }
    }
  }
  public verifyRefreshToken(token: string): {
    userId: string;
    sessionId: string;
    roles?: string[];
  } {
    try {
      const payload = jwt.verify(token, this.config.jwtSecret) as any;
      if (payload.type !== 'refresh') {
        throw new Error('INVALID_TOKEN_TYPE');
      }
      logger.debug('Refresh token verified', {
        userId: payload.userId,
        sessionId: payload.sessionId,
      });
      return {
        userId: payload.userId,
        sessionId: payload.sessionId,
        roles: payload.roles,
      };
    } catch (error) {
      if (error instanceof TokenExpiredError) {
        logger.warn('Refresh token expired');
        throw new Error('REFRESH_TOKEN_EXPIRED');
      } else if (error instanceof JsonWebTokenError) {
        logger.warn('Invalid refresh token');
        throw new Error('INVALID_REFRESH_TOKEN');
      } else {
        logger.error('Refresh token verification failed', {
          error: error as Error,
        });
        throw error;
      }
    }
  }

  public verifyToken(token: string): Promise<JWTPayload> {
    return new Promise((resolve, reject) => {
      try {
        const payload = this.verifyAccessToken(token);
        resolve(payload);
      } catch (error) {
        reject(error);
      }
    });
  }

  public decodeToken(token: string): JWTPayload | null {
    try {
      return jwt.decode(token) as JWTPayload;
    } catch (error) {
      logger.error('Failed to decode token', { error: error as Error });
      return null;
    }
  }

  public isTokenExpired(token: string): boolean {
    try {
      const decoded = this.decodeToken(token);
      if (!decoded || !decoded.exp) {
        return true;
      }
      return Date.now() >= decoded.exp * 1000;
    } catch (error) {
      return true;
    }
  }

  public getTokenExpirationTime(token: string): Date | null {
    try {
      const decoded = this.decodeToken(token);
      if (!decoded || !decoded.exp) {
        return null;
      }
      return new Date(decoded.exp * 1000);
    } catch (error) {
      return null;
    }
  }
}
