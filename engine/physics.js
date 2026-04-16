// engine/physics.js — AABB collision, gravity, platform resolution

export const GRAVITY = 0.6;
export const TERMINAL_VEL = 18;

// Axis-Aligned Bounding Box overlap test
export function aabbOverlap(a, b) {
  return (
    a.x < b.x + b.w &&
    a.x + a.w > b.x &&
    a.y < b.y + b.h &&
    a.y + a.h > b.y
  );
}

// Returns overlap vector {dx, dy} or null if no overlap
export function aabbIntersect(a, b) {
  const overlapX = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const overlapY = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  if (overlapX <= 0 || overlapY <= 0) return null;
  return { dx: overlapX, dy: overlapY };
}

// Apply gravity to an entity with vy property
export function applyGravity(entity, mult = 1) {
  entity.vy += GRAVITY * mult;
  if (entity.vy > TERMINAL_VEL) entity.vy = TERMINAL_VEL;
}

// Resolve entity against a list of platform rects
// Entity needs: x, y, w, h, vx, vy, onGround
export function resolvePlatforms(entity, platforms) {
  entity.onGround = false;
  entity.x += entity.vx;
  entity.y += entity.vy;

  for (const plat of platforms) {
    if (!aabbOverlap(entity, plat)) continue;

    const overlapX = Math.min(entity.x + entity.w, plat.x + plat.w) - Math.max(entity.x, plat.x);
    const overlapY = Math.min(entity.y + entity.h, plat.y + plat.h) - Math.max(entity.y, plat.y);

    if (overlapX < overlapY) {
      // Horizontal resolution
      if (entity.x < plat.x) entity.x -= overlapX;
      else                    entity.x += overlapX;
      entity.vx = 0;
    } else {
      // Vertical resolution
      if (entity.y < plat.y) {
        // Landing on top
        entity.y -= overlapY;
        entity.vy = 0;
        entity.onGround = true;
        if (plat.type === 'crumble' && !plat.triggered) {
          plat.triggered = true;
          plat.crumbleTimer = 90; // 1.5s at 60fps
        }
      } else {
        // Hitting ceiling
        entity.y += overlapY;
        entity.vy = 0;
      }
    }
  }
}

// Cloud platform: only solid from above when falling
export function resolveCloudPlatforms(entity, clouds) {
  for (const plat of clouds) {
    if (entity.vy < 0) continue; // only resolve when falling
    if (entity.y + entity.h > plat.y && entity.y + entity.h < plat.y + plat.h + entity.vy + 1) {
      if (entity.x + entity.w > plat.x && entity.x < plat.x + plat.w) {
        entity.y = plat.y - entity.h;
        entity.vy = 0;
        entity.onGround = true;
      }
    }
  }
}
