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
