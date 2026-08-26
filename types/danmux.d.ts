export type DanmuMode = 'scroll' | 'top' | 'bottom' | 'reverse' | 'fixed' | 'advanced';
export type GradientTarget = 'fill' | 'stroke';
export type GradientOrigin = 'native' | 'generated';
export interface DanmuSource { platform: string; id: string; }
export interface GradientStop { position: number; color: `#${string}`; alpha?: number; }
export interface TextureGradientSource { type: 'texture'; uri: string; assetId?: string; sha256?: string; mime?: string; }
export interface LinearGradientSource { type: 'linear'; angle: number; stops: GradientStop[]; }
export interface GradientEffect { type: 'gradient'; target: GradientTarget; origin?: GradientOrigin; source: TextureGradientSource | LinearGradientSource; }
export interface VendorEffect { type: 'vendor'; vendor: string; name: string; data: unknown; }
export type DanmuEffect = GradientEffect | VendorEffect;
export interface DanmuX { schemaVersion: 1; id: string; time: number; text: string; mode: DanmuMode; fontSize: number; color: number; source: DanmuSource; effects?: DanmuEffect[]; vendor?: Record<string, unknown>; }
export interface CompatibilityWire { p: string; m: string; danmux?: { extensionVersion: 1; effects?: DanmuEffect[]; lossReport?: Array<Record<string, unknown>>; }; }
export interface Diagnostic { code: string; message?: string; path?: string; [key: string]: unknown; }
export interface Result<T> { ok: boolean; value?: T; diagnostics: Diagnostic[]; }
export type WireProfile = 'ddplay-json' | 'bilibili-xml';
export interface DanDanPlayComment { p: string; m: string; lossReport?: Diagnostic[]; }
export interface GradientConfig { target?: GradientTarget; angle?: number; stops?: GradientStop[]; force?: boolean; }

export const SCHEMA_VERSION: 1;
export const DANMUX_STANDARD_VERSION: 1;
export const EXTENSION_VERSION: 1;
export const DANDANPLAY_WIRE_PROFILES: Readonly<{ JSON: 'ddplay-json'; BILIBILI_XML: 'bilibili-xml'; }>;

export function validateBase(input: unknown): Result<DanmuX>;
export function createDanmuX(input: Omit<DanmuX, 'schemaVersion'> & { schemaVersion?: 1 }): Result<DanmuX>;
export function stableIdentity(item: DanmuX): string;
export function withEffects(item: DanmuX, effects?: DanmuEffect[]): Result<DanmuX>;
export function validateGradientEffect(effect: unknown, path?: string): Result<GradientEffect>;
export function canonicalizeGradientEffect(effect: GradientEffect): GradientEffect;
export function fromBilibili(raw: Record<string, unknown>): Result<DanmuX>;
export function toDanDanPlay(item: DanmuX, options?: { profile?: WireProfile; sourceLabel?: string; timestamp?: number; pool?: number; userHash?: string | number; danmakuId?: string | number }): DanDanPlayComment;
export function toEnhanced(item: DanmuX): DanmuX & { extensionVersion: 1 };
export function toCompatibilityWire(item: DanmuX, options?: Parameters<typeof toDanDanPlay>[1]): CompatibilityWire;
export function fromCompatibilityWire(wire: CompatibilityWire & { id?: string; cid?: string | number }, source?: DanmuSource): Result<DanmuX>;
export function applyGradient(item: DanmuX, config?: GradientConfig): Result<DanmuX> & { generated: boolean; variantKey?: string };
export function transformBatch(items: DanmuX[], config?: GradientConfig): { items: DanmuX[]; diagnostics: Array<Diagnostic & { index: number }> };
export function aggregate(items: DanmuX[]): { items: DanmuX[]; lossReport: Diagnostic[] };
export function negotiateCapabilities(requested?: Record<string, string[]>): Record<string, unknown>;
export function createMetrics(): { increment(name: string, amount?: number): void; snapshot(): Record<string, number>; };

export class AssetResolver {
  constructor(options?: Record<string, unknown>);
  resolve(asset: TextureGradientSource): Promise<{ ok: boolean; code?: string; mime?: string; bytes?: number; pixels?: number; sha256?: string; data?: Uint8Array; cached?: boolean }>;
}
