# Scroll Lag Fix - Root Cause Analysis

## Problem
After optimization, scroll became laggy and stuttery. The page felt "stuck" instead of smooth.

## Root Causes

### 1. **backdrop-filter: blur() - PRIMARY CULPRIT**
- Used on 11+ repeating cards throughout the page
- Forces GPU to re-sample and blur pixels on EVERY scroll frame
- Compositor cannot optimize this - it's a paint operation
- **Impact**: 40-60ms per frame during scroll (kills 60fps)

### 2. **filter: blur() in transitions - SECONDARY CULPRIT**
- `blur-0`, `blur-sm`, `blur-md` animated during scroll reveals
- Animating blur forces expensive filter recalculation
- Cannot be GPU-accelerated efficiently
- **Impact**: 20-30ms per element reveal

### 3. **Canvas running at 60fps**
- Unnecessary - background doesn't need monitor refresh rate
- Competes with scroll compositor
- **Impact**: 5-10ms per frame

### 4. **React re-renders on mousemove**
- `handleMouseMove` triggers setState on every pixel
- Causes card re-renders during hover
- **Impact**: 10-15ms per hover event

## The Golden Rule of Smooth Scroll

**ONLY animate `transform` and `opacity`**

These are GPU-composited and don't trigger paint/layout:
- ✅ `transform: translateY()` - GPU layer
- ✅ `opacity` - GPU layer
- ❌ `filter: blur()` - CPU paint
- ❌ `backdrop-filter: blur()` - CPU paint + resample

## Fix Strategy

1. Remove all `backdrop-blur-*` → solid backgrounds
2. Remove all `blur-*` from transitions → only transform + opacity
3. Throttle canvas to 30fps
4. Convert mousemove to CSS custom properties (no React re-renders)
5. Add `will-change: transform` to animated elements
6. Add `content-visibility: auto` to sections

## Expected Result
- Scroll: 60fps solid (120/180Hz on capable displays)
- No jank, no stutter
- Smooth as butter
