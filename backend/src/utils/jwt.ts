import jwt, { SignOptions } from 'jsonwebtoken';
import { config } from '../config/env.js';

export interface JwtPayload {
    userId: string;
    email: string;
    role: string;
}

export function signToken(payload: JwtPayload): string {
    const options: SignOptions = {
        expiresIn: config.jwt.expiresIn as unknown as SignOptions['expiresIn'],
    };
    return jwt.sign(payload, config.jwt.secret, options);
}

export function verifyToken(token: string): JwtPayload {
    return jwt.verify(token, config.jwt.secret) as JwtPayload;
}

export function decodeToken(token: string): JwtPayload | null {
    try {
        return jwt.decode(token) as JwtPayload;
    } catch {
        return null;
    }
}
